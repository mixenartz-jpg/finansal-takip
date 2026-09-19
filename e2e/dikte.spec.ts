import { test, expect, type Page } from "@playwright/test";

/**
 * Dikte akışı — uçtan uca.
 *
 * ── NEDEN MOCK ──
 *
 * Gerçek mikrofon CI'da yok ve olsa bile ses çalmak deterministik
 * değil. `SpeechRecognition` yapıcısı sayfa yüklenmeden önce sahte
 * bir sınıfla değiştirilir; uygulama kodu bunu gerçeğinden ayırt
 * edemez çünkü aynı arayüzü uygular.
 *
 * Test ettiğimiz şey ses tanıma DEĞİL (o tarayıcının işi), tanınan
 * metnin doğru ayrıştırılıp onay kartına doğru yansıması.
 */

/** Verilen metni "duyan" sahte SpeechRecognition kurar. */
async function mockSpeech(page: Page, transcript: string) {
  await page.addInitScript((text: string) => {
    class FakeSpeechRecognition extends EventTarget {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      onend: ((ev: unknown) => void) | null = null;
      onstart: ((ev: unknown) => void) | null = null;
      onspeechend: ((ev: unknown) => void) | null = null;

      start() {
        setTimeout(() => {
          this.onstart?.(new Event("start"));
          setTimeout(() => {
            const result = [{ transcript: text, confidence: 0.95 }] as unknown as {
              isFinal: boolean;
              length: number;
              [i: number]: { transcript: string; confidence: number };
            };
            result.isFinal = true;
            result.length = 1;
            const results = [result] as unknown as {
              length: number;
              [i: number]: typeof result;
            };
            results.length = 1;
            this.onresult?.({ resultIndex: 0, results });
            this.onend?.(new Event("end"));
          }, 50);
        }, 10);
      }
      stop() {
        this.onend?.(new Event("end"));
      }
      abort() {}
    }

    Object.defineProperty(window, "SpeechRecognition", {
      value: FakeSpeechRecognition,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: FakeSpeechRecognition,
      writable: true,
      configurable: true,
    });
  }, transcript);
}

test.describe("sesli işlem ekleme", () => {
  test("gider cümlesi onay kartına doğru yansır", async ({ page }) => {
    await mockSpeech(page, "200 tl yemek aldım");
    await page.goto("/");

    await page.getByRole("button", { name: "Sesli işlem ekle" }).click();
    await page.getByRole("button", { name: "Sesli giriş başlat" }).click();

    // Onay kartı gelmeli — otomatik kayıt YOK.
    await expect(page.getByText("Duyduğum")).toBeVisible();
    await expect(page.getByText('"200 tl yemek aldım"')).toBeVisible();

    // Alanlar doğru doldurulmuş olmalı.
    await expect(page.locator("#draft-kind")).toHaveValue("expense");
    await expect(page.locator("#draft-amount")).toHaveValue("200");

    // Kaydet düğmesi var ama henüz basılmadı: hiçbir şey kaydedilmedi.
    await expect(page.getByRole("button", { name: "Kaydet" })).toBeVisible();
  });

  test("gelir cümlesi doğru tür ve tutar üretir", async ({ page }) => {
    await mockSpeech(page, "bugün 40 bin tl para geldi");
    await page.goto("/");

    await page.getByRole("button", { name: "Sesli işlem ekle" }).click();
    await page.getByRole("button", { name: "Sesli giriş başlat" }).click();

    await expect(page.locator("#draft-kind")).toHaveValue("income");
    await expect(page.locator("#draft-amount")).toHaveValue("40000");
  });

  test("belirsiz cümlede tür boş bırakılır ve uyarı gösterilir", async ({ page }) => {
    // Parser uydurmamalı: "aldım" hem gelir hem gider olabilir.
    await mockSpeech(page, "aldım");
    await page.goto("/");

    await page.getByRole("button", { name: "Sesli işlem ekle" }).click();
    await page.getByRole("button", { name: "Sesli giriş başlat" }).click();

    await expect(page.locator("#draft-kind")).toHaveValue("");
    await expect(page.getByText(/gelir mi gider mi/i)).toBeVisible();
  });

  test("vazgeç kartı kapatır ve kayıt yapmaz", async ({ page }) => {
    await mockSpeech(page, "200 tl yemek aldım");
    await page.goto("/");

    await page.getByRole("button", { name: "Sesli işlem ekle" }).click();
    await page.getByRole("button", { name: "Sesli giriş başlat" }).click();
    await expect(page.getByText("Duyduğum")).toBeVisible();

    await page.getByRole("button", { name: "Vazgeç" }).click();
    await expect(page.getByText("Duyduğum")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Sesli giriş başlat" })).toBeVisible();
  });
});

test.describe("desteklenmeyen tarayıcı", () => {
  test("API yoksa mikrofon yerine açıklama gösterilir", async ({ page }) => {
    await page.addInitScript(() => {
      // Chromium'da var olan API'yi kaldır — Firefox durumunu taklit et.
      Object.defineProperty(window, "SpeechRecognition", {
        value: undefined, writable: true, configurable: true,
      });
      Object.defineProperty(window, "webkitSpeechRecognition", {
        value: undefined, writable: true, configurable: true,
      });
    });
    await page.goto("/");

    await page.getByRole("button", { name: "Sesli işlem ekle" }).click();
    await expect(page.getByText(/desteklenmiyor/i)).toBeVisible();
    // Kullanıcı çıkmazda kalmamalı: manuel ekleme önerilir.
    await expect(page.getByText(/elle/i)).toBeVisible();
  });
});
