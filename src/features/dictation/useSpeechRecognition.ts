"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  detectSupport,
  getRecognitionConstructor,
  translateRecognitionError,
  type DictationSupport,
} from "./support";

export type ListeningState = "idle" | "listening" | "error";

export interface SpeechRecognitionOptions {
  lang?: string;
  /**
   * Kesinleşmiş metin geldiğinde çağrılır. Verilirse metin
   * `transcript`'e BİRİKTİRİLMEZ — çağıran kendi state'ine yazar.
   * Bu, "transcript değişince efektte state güncelle" zincirini
   * (çift render) ortadan kaldırır.
   */
  onFinal?: (text: string) => void;
}

export interface SpeechRecognitionHook {
  state: ListeningState;
  /** Kesinleşmiş metin — kullanıcı konuşmayı bitirdiğinde dolar. */
  transcript: string;
  /** Anlık (geçici) metin — konuşurken canlı görünür. */
  interim: string;
  error: string | null;
  support: DictationSupport;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

const SERVER_SUPPORT: DictationSupport = { supported: false, reason: "no-window" };
let clientSupport: DictationSupport | null = null;

// Destek oturum boyunca değişmez: abone olunacak bir şey yok.
const subscribeNoop = () => () => {};
// Anlık görüntü KARARLI olmalı — her çağrıda yeni nesne dönerse
// useSyncExternalStore sonsuz render döngüsüne girer.
const getClientSupport = () => (clientSupport ??= detectSupport());
const getServerSupport = () => SERVER_SUPPORT;

/**
 * Web Speech API sarmalayıcısı.
 *
 * ── SUNUCU/İSTEMCİ AYRIMI ──
 *
 * Destek tespiti `useSyncExternalStore` ile yapılır: sunucuda ve
 * hidrasyon sırasında `getServerSnapshot` ("no-window") kullanılır,
 * hidrasyondan sonra istemci değeri okunur. Böylece hidrasyon
 * uyuşmazlığı olmaz ve efektte `setState` gerekmez.
 *
 * ── NEDEN continuous = false ──
 *
 * Kullanıcı tek bir işlem söylüyor, dikte notu tutmuyor. `continuous`
 * açık olsaydı mikrofon konuşma bittikten sonra da açık kalır, arka
 * plan sesi transkripte karışırdı.
 */
export function useSpeechRecognition(
  options: SpeechRecognitionOptions = {},
): SpeechRecognitionHook {
  const { lang = "tr-TR", onFinal } = options;
  const [state, setState] = useState<ListeningState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const support = useSyncExternalStore(subscribeNoop, getClientSupport, getServerSupport);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // En güncel geri çağrı. Ref render sırasında değil efektte
  // yazılır; `start` bağımlılığa girmeden hep yenisini çağırır.
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  // Bileşen kaldırılırken mikrofonu kapat: açık kalan tanıma
  // oturumu tarayıcıda kayıt göstergesini yakık bırakır.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionConstructor();
    if (!Ctor) {
      setError("Sesli giriş bu tarayıcıda desteklenmiyor.");
      setState("error");
      return;
    }

    // Önceki oturum varsa temizle — iki tanıma aynı anda çalışamaz.
    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setState("listening");
      setError(null);
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finalText += text;
        else interimText += text;
      }

      if (finalText && onFinalRef.current) {
        onFinalRef.current(finalText.trim());
        setInterim("");
      } else if (finalText) {
        setTranscript((prev) => (prev ? `${prev} ${finalText}` : finalText).trim());
        setInterim("");
      } else {
        setInterim(interimText);
      }
    };

    recognition.onerror = (event) => {
      // "aborted" kullanıcının kendi durdurması; hata olarak
      // gösterilmesi gereksiz gürültü üretir.
      if (event.error === "aborted") {
        setState("idle");
        return;
      }
      setError(translateRecognitionError(event.error));
      setState("error");
    };

    recognition.onend = () => {
      setState((current) => (current === "error" ? "error" : "idle"));
      setInterim("");
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      // `start()` zaten çalışan bir tanımada InvalidStateError atar.
      setError("Kayıt başlatılamadı. Tekrar deneyin.");
      setState("error");
    }
  }, [lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    recognitionRef.current?.abort();
    setTranscript("");
    setInterim("");
    setError(null);
    setState("idle");
  }, []);

  return { state, transcript, interim, error, support, start, stop, reset };
}
