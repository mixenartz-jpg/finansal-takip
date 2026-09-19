"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectSupport,
  getRecognitionConstructor,
  translateRecognitionError,
  type DictationSupport,
} from "./support";

export type ListeningState = "idle" | "listening" | "error";

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

/**
 * Web Speech API sarmalayıcısı.
 *
 * ── SUNUCU/İSTEMCİ AYRIMI ──
 *
 * Destek tespiti `useEffect` içinde yapılır, ilk render'da DEĞİL.
 * Sunucuda `window` yoktur; ilk render'da "desteklenmiyor" deyip
 * istemcide "destekleniyor" demek hidrasyon uyuşmazlığı üretir ve
 * React ekranı baştan çizer.
 *
 * ── NEDEN continuous = false ──
 *
 * Kullanıcı tek bir işlem söylüyor, dikte notu tutmuyor. `continuous`
 * açık olsaydı mikrofon konuşma bittikten sonra da açık kalır, arka
 * plan sesi transkripte karışırdı.
 */
export function useSpeechRecognition(lang = "tr-TR"): SpeechRecognitionHook {
  const [state, setState] = useState<ListeningState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [support, setSupport] = useState<DictationSupport>({
    supported: false,
    reason: "no-window",
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Destek tespiti yalnızca istemcide, montajdan sonra.
  useEffect(() => {
    setSupport(detectSupport());
  }, []);

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

      if (finalText) {
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
