import { describe, test, expect } from "vitest";
import {
  detectSupport,
  supportMessage,
  getRecognitionConstructor,
  translateRecognitionError,
} from "./support";

/** Sahte pencere kurucusu — jsdom yerine düz nesne yeter. */
function fakeWindow(opts: {
  secure?: boolean;
  api?: "standard" | "webkit" | "none";
  brave?: boolean;
}): Window {
  const ctor = function () {} as unknown as SpeechRecognitionConstructor;
  const w: Record<string, unknown> = {
    isSecureContext: opts.secure ?? true,
  };
  if (opts.api === "standard") w.SpeechRecognition = ctor;
  if (opts.api === "webkit") w.webkitSpeechRecognition = ctor;
  w.navigator = opts.brave ? { brave: { isBrave: async () => true } } : {};
  return w as unknown as Window;
}

describe("detectSupport", () => {
  test("standart API varsa destekleniyor", () => {
    expect(detectSupport(fakeWindow({ api: "standard" })).supported).toBe(true);
  });

  test("webkit önekli API varsa destekleniyor -- Chrome/Edge bu yolu kullanır", () => {
    expect(detectSupport(fakeWindow({ api: "webkit" })).supported).toBe(true);
  });

  test("API yoksa desteklenmiyor -- Firefox durumu", () => {
    const r = detectSupport(fakeWindow({ api: "none" }));
    expect(r.supported).toBe(false);
    expect(r.supported === false && r.reason).toBe("no-api");
  });

  test("güvensiz bağlamda desteklenmiyor -- HTTP üzerinden mikrofon açılmaz", () => {
    const r = detectSupport(fakeWindow({ api: "standard", secure: false }));
    expect(r.supported).toBe(false);
    expect(r.supported === false && r.reason).toBe("insecure-context");
  });

  test("Brave'de API görünse bile desteklenmiyor -- servis engelli", () => {
    const r = detectSupport(fakeWindow({ api: "webkit", brave: true }));
    expect(r.supported).toBe(false);
    expect(r.supported === false && r.reason).toBe("brave");
  });

  test("navigator'ı olmayan pencerede çökmez", () => {
    const w = { isSecureContext: true, SpeechRecognition: function () {} } as unknown as Window;
    expect(detectSupport(w).supported).toBe(true);
  });

  test("sunucu tarafında (window yok) desteklenmiyor sayılır", () => {
    const r = detectSupport(undefined);
    expect(r.supported).toBe(false);
    expect(r.supported === false && r.reason).toBe("no-window");
  });
});

describe("supportMessage", () => {
  test("destekleniyorsa mesaj yok", () => {
    expect(supportMessage({ supported: true })).toBeNull();
  });

  test("API yoksa alternatif önerir -- kullanıcı çıkmazda kalmamalı", () => {
    const msg = supportMessage({ supported: false, reason: "no-api" });
    expect(msg).toContain("elle");
  });

  test("güvensiz bağlamda HTTPS'ten bahseder", () => {
    expect(supportMessage({ supported: false, reason: "insecure-context" })).toContain(
      "HTTPS",
    );
  });

  test("Brave'de sebebi ve çıkış yolunu söyler", () => {
    const msg = supportMessage({ supported: false, reason: "brave" });
    expect(msg).toContain("Brave");
    expect(msg).toContain("Chrome");
  });

  test("sunucu tarafında mesaj gösterilmez -- yanıp sönen uyarı olmaz", () => {
    expect(supportMessage({ supported: false, reason: "no-window" })).toBeNull();
  });
});

describe("getRecognitionConstructor", () => {
  test("standart yapıcıyı döndürür", () => {
    expect(getRecognitionConstructor(fakeWindow({ api: "standard" }))).toBeTypeOf("function");
  });
  test("webkit yapıcısını döndürür", () => {
    expect(getRecognitionConstructor(fakeWindow({ api: "webkit" }))).toBeTypeOf("function");
  });
  test("yoksa null döndürür", () => {
    expect(getRecognitionConstructor(fakeWindow({ api: "none" }))).toBeNull();
  });
  test("window yoksa null döndürür", () => {
    expect(getRecognitionConstructor(undefined)).toBeNull();
  });
});

describe("translateRecognitionError -- her kod Türkçe karşılık taşır", () => {
  const codes: SpeechRecognitionErrorCode[] = [
    "no-speech", "aborted", "audio-capture", "network",
    "not-allowed", "service-not-allowed", "bad-grammar", "language-not-supported",
  ];

  for (const code of codes) {
    test(`"${code}" boş olmayan Türkçe mesaj verir`, () => {
      const msg = translateRecognitionError(code);
      expect(msg.length).toBeGreaterThan(0);
      // Ham hata kodu kullanıcıya sızmamalı.
      expect(msg).not.toContain(code);
    });
  }

  test("izin hatası ne yapılacağını söyler", () => {
    expect(translateRecognitionError("not-allowed")).toContain("izin");
  });
});
