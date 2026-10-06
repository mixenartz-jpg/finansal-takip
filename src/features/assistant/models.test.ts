import { describe, expect, test } from "vitest";
import { MODEL_CHAIN, NO_RESPONSE, TIMED_OUT, shouldFallback } from "./models";

/**
 * Model zinciri POLİTİKASI.
 *
 * Ücretsiz katmanda her Flash modelinin GÜNLÜK kotası ayrıdır.
 * Tek model ~5 istek demek; zincir toplamı ~35'e çıkarır.
 */

describe("MODEL_CHAIN", () => {
  test("spec'teki beş model, spec'teki sırada", () => {
    expect(MODEL_CHAIN).toEqual([
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
    ]);
  });

  /**
   * En cömert kotalı model SONDA olmalı. Başa alınsa zincir hiç
   * ilerlemez ve en zeki modeller hiç kullanılmaz.
   */
  test("flash-lite son çare", () => {
    expect(MODEL_CHAIN.at(-1)).toBe("gemini-3.5-flash-lite");
  });

  test("live modeli zincirde YOK", () => {
    // Live API kalıcı WebSocket ister; route handler'a uymuyor.
    expect(MODEL_CHAIN.some((m) => m.includes("live"))).toBe(false);
  });
});

describe("shouldFallback -- ★ hangi hata zinciri ilerletir", () => {
  test("429 (kota) sıradaki modele düşer", () => {
    expect(shouldFallback(429)).toBe(true);
  });

  test("5xx (geçici sunucu hatası) düşer", () => {
    for (const s of [500, 502, 503, 504]) {
      expect(shouldFallback(s), `${s} düşmedi`).toBe(true);
    }
  });

  /**
   * ── CEVAP HİÇ GELMEDİ (0) ──
   *
   * Ağ koptuğunda `callGemini` durum 0 döner. Bu GEÇİCİ bir hata:
   * ikinci deneme ucuz ve sık işe yarıyor. Dışarıda bırakılınca
   * tek bir ağ titremesi zinciri ilk modelde durduruyordu —
   * `chain.test.ts`'teki "ağ kopması da düşürür" testi bunu
   * yakaladı.
   */
  test("★ cevap gelmemesi (0) düşer", () => {
    expect(shouldFallback(NO_RESPONSE)).toBe(true);
    expect(shouldFallback(0)).toBe(true);
  });

  /**
   * ── NEDEN 401/403/400 DÜŞMEZ ──
   *
   * Geçersiz anahtar veya bozuk istek HER MODELDE aynı sonucu verir.
   * Zinciri ilerletmek beş çağrıyı boşa harcar, kullanıcıyı beş kat
   * bekletir ve sonunda aynı hatayı gösterir. Daha kötüsü: gerçek
   * sebep (anahtar yanlış) son modelin hatası arkasına saklanır.
   */
  test("401/403 (anahtar) düşmez", () => {
    expect(shouldFallback(401)).toBe(false);
    expect(shouldFallback(403)).toBe(false);
  });

  test("400 (bozuk istek) düşmez", () => {
    expect(shouldFallback(400)).toBe(false);
  });

  test("404 ve 422 düşmez", () => {
    expect(shouldFallback(404)).toBe(false);
    expect(shouldFallback(422)).toBe(false);
  });

  test("200 düşmez", () => {
    expect(shouldFallback(200)).toBe(false);
  });
});

describe("shouldFallback -- zaman aşımı", () => {
  test("zaman aşımı zinciri ilerletir", () => {
    expect(shouldFallback(TIMED_OUT)).toBe(true);
  });
});
