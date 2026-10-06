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
 *
 * ── BRAVE ──
 *
 * Brave Chromium tabanlı olduğu için `webkitSpeechRecognition`
 * TANIMLI, ama sesi yazıya çeviren Google servisine bağlanmıyor:
 * her deneme "network" hatasıyla biter. API var göründüğü için
 * yukarıdaki kontrol bunu yakalayamaz; Brave'in kendi işareti
 * (`navigator.brave`) ayrıca sorulur.
 */

export type DictationSupport =
  | { supported: true }
  | { supported: false; reason: "no-api" | "insecure-context" | "no-window" | "brave" };

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

  if ("brave" in (win.navigator ?? {})) {
    return { supported: false, reason: "brave" };
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
    case "brave":
      return "Sesli giriş Brave'de çalışmıyor: Brave ses tanıma servisine bağlanmıyor. Chrome veya Edge kullanabilir ya da yazarak devam edebilirsiniz.";
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
      return "Ses tanıma servisine ulaşılamadı. Bağlantınızı kontrol edin; hep oluyorsa tarayıcınız bu servisi desteklemiyor olabilir, Chrome veya Edge deneyin.";
    case "aborted":
      return "Kayıt durduruldu.";
    case "language-not-supported":
      return "Türkçe ses tanıma bu tarayıcıda desteklenmiyor.";
    case "bad-grammar":
      return "Ses anlaşılamadı. Tekrar deneyin.";
  }
}
