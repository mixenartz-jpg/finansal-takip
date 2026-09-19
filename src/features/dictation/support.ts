/**
 * Tarayıcı desteği tespiti.
 *
 * ── NEDEN ÖNEMLİ ──
 *
 * Web Speech API yalnızca Chromium tabanlı tarayıcılarda (Chrome,
 * Edge, Opera) çalışır. Safari'nin kendi uygulaması vardır ama
 * `webkitSpeechRecognition` adıyla ve Firefox'ta hiç yoktur.
 *
 * Desteklenmeyen tarayıcıda mikrofon düğmesi GÖSTERİLMEZ. Görünüp
 * tıklandığında hiçbir şey yapmayan bir düğme, olmayan bir düğmeden
 * kötüdür: kullanıcı uygulamanın bozuk olduğunu düşünür. Manuel form
 * her tarayıcıda çalışır ve uygulama onsuz da tam işlevlidir.
 *
 * ── GÜVENLİ BAĞLAM ──
 *
 * API mikrofona eriştiği için HTTPS (ya da localhost) zorunludur.
 * `window.isSecureContext` bunu doğrudan söyler; HTTP üzerinden
 * yayına alınırsa dikte sessizce çalışmaz ve nedeni belirsiz olur.
 */

export type DictationSupport =
  | { supported: true }
  | { supported: false; reason: "no-api" | "insecure-context" | "no-window" };

export function detectSupport(win: Window | undefined = globalThis.window): DictationSupport {
  if (typeof win === "undefined") {
    // Sunucu tarafı render: henüz bilemeyiz.
    return { supported: false, reason: "no-window" };
  }

  if (!win.isSecureContext) {
    return { supported: false, reason: "insecure-context" };
  }

  const ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  if (!ctor) {
    return { supported: false, reason: "no-api" };
  }

  return { supported: true };
}

/** Kullanıcıya gösterilecek açıklama. */
export function supportMessage(support: DictationSupport): string | null {
  if (support.supported) return null;
  switch (support.reason) {
    case "no-api":
      return "Sesli giriş bu tarayıcıda desteklenmiyor. Chrome veya Edge kullanabilir ya da işlemi elle ekleyebilirsiniz.";
    case "insecure-context":
      return "Sesli giriş için güvenli bağlantı (HTTPS) gerekiyor.";
    case "no-window":
      return null;
  }
}

/** Ortamdaki SpeechRecognition yapıcısını döndürür. */
export function getRecognitionConstructor(
  win: Window | undefined = globalThis.window,
): SpeechRecognitionConstructor | null {
  if (typeof win === "undefined") return null;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

/** Konuşma tanıma hatalarının Türkçe karşılıkları. */
export function translateRecognitionError(code: SpeechRecognitionErrorCode): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verip tekrar deneyin.";
    case "no-speech":
      return "Ses algılanmadı. Tekrar deneyin.";
    case "audio-capture":
      return "Mikrofona erişilemedi. Başka bir uygulama kullanıyor olabilir.";
    case "network":
      return "Ses tanıma servisine ulaşılamadı. Bağlantınızı kontrol edin.";
    case "aborted":
      return "Kayıt durduruldu.";
    case "language-not-supported":
      return "Türkçe ses tanıma bu tarayıcıda desteklenmiyor.";
    case "bad-grammar":
      return "Ses anlaşılamadı. Tekrar deneyin.";
  }
}
