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

test.describe("asistan -- sesli giriş", () => {
  /**
   * ── SES OTOMATİK GÖNDERİLMEZ ──
   *
   * Dikte panelinde transkript kesinleşince cümle doğrudan
   * ayrıştırılıyordu. Sohbette metin KUTUYA yazılıyor: yanlış
   * duyulan bir cümleyi kullanıcı düzeltebilmeli. Otomatik
   * göndermek, "200" yerine "2000" duyulduğunda kullanıcıyı
   * yanlış onay kartıyla karşılaştırırdı.
   */
  test("ses metne çevrilip kutuya yazılır, otomatik GÖNDERİLMEZ", async ({ page }) => {
    await mockSpeech(page, "200 tl yemek aldım");
    await page.goto("/");

    await page.getByRole("button", { name: "Asistanı aç" }).click();
    await page.getByRole("button", { name: "Sesli giriş başlat" }).click();

    const box = page.getByLabel("Asistana yaz");
    await expect(box).toHaveValue(/200 tl yemek aldım/);

    // Onay kartı henüz YOK: kullanıcı göndermedi.
    await expect(page.getByRole("button", { name: "Onayla" })).toHaveCount(0);
  });

  /**
   * ── KURAL MOTORU ÖNCE ──
   *
   * Basit cümlede Gemini'ye hiç gidilmemeli: ücretsiz, anlık ve
   * çevrimdışı çalışan kural motoru yeterli. Ağ isteği sayılarak
   * doğrulanıyor — yorumla değil.
   */
  test("★ basit cümlede /api/chat'e İSTEK GİTMEZ", async ({ page }) => {
    const chatCalls: string[] = [];
    await page.route("**/api/chat", (route) => {
      chatCalls.push(route.request().url());
      return route.fulfill({ status: 503, body: "{}" });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Asistanı aç" }).click();

    await page.getByLabel("Asistana yaz").fill("200 tl yemek aldım");
    await page.getByRole("button", { name: "Gönder" }).click();

    // Onay kartı kural motorundan geldi.
    await expect(page.getByRole("button", { name: "Onayla" })).toBeVisible();
    expect(chatCalls, "kural motoru yeterliyken Gemini çağrıldı").toHaveLength(0);
  });

  /**
   * Belirsiz cümle (gelir mi gider mi) kural motorunu aşar ve
   * Gemini'ye devredilmeli.
   */
  test("★ belirsiz cümle /api/chat'e DEVREDİLİR", async ({ page }) => {
    let called = 0;
    await page.route("**/api/chat", (route) => {
      called += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ text: "Bu gelir mi gider mi?" }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Asistanı aç" }).click();

    await page.getByLabel("Asistana yaz").fill("aldım");
    await page.getByRole("button", { name: "Gönder" }).click();

    await expect(page.getByText("Bu gelir mi gider mi?")).toBeVisible();
    expect(called).toBe(1);
  });

  /** Vazgeçilen eylem kaydedilmez ve durumu görünür kalır. */
  test("vazgeçilen eylem kaydedilmez", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Asistanı aç" }).click();

    await page.getByLabel("Asistana yaz").fill("200 tl yemek aldım");
    await page.getByRole("button", { name: "Gönder" }).click();
    await expect(page.getByRole("button", { name: "Onayla" })).toBeVisible();

    await page.getByRole("button", { name: "Vazgeç" }).click();
    await expect(page.getByText("Vazgeçildi")).toBeVisible();
    await expect(page.getByRole("button", { name: "Onayla" })).toHaveCount(0);
  });
});

test.describe("asistan -- desteklenmeyen tarayıcı", () => {
  /**
   * Mikrofon yoksa sohbet YAZARAK çalışmaya devam eder. Dikte
   * panelinde tüm panel kullanılamaz hale geliyordu; sohbette
   * yalnızca mikrofon düğmesi gizleniyor.
   */
  test("mikrofon yoksa yazarak devam edilir", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "SpeechRecognition", {
        value: undefined, writable: true, configurable: true,
      });
      Object.defineProperty(window, "webkitSpeechRecognition", {
        value: undefined, writable: true, configurable: true,
      });
    });
    await page.goto("/");

    await page.getByRole("button", { name: "Asistanı aç" }).click();

    // Mikrofon düğmesi GİZLİ, metin kutusu çalışıyor.
    await expect(page.getByRole("button", { name: "Sesli giriş başlat" })).toHaveCount(0);
    await expect(page.getByLabel("Asistana yaz")).toBeVisible();
  });
});

test.describe("asistan -- yazma araçları", () => {
  /**
   * ── İŞLEM DIŞI ARAÇLAR DA ÇALIŞIR ──
   *
   * Faz 4'te yalnızca `createTransaction` bağlıydı; diğer her
   * niyet "henüz uygulayamıyorum" diyordu. Bu test kategori
   * eklemenin gerçekten kaydedildiğini doğruluyor — onay kartı
   * göründü ve "Uygulandı" dedi.
   */
  test("★ kategori ekleme niyeti uygulanır", async ({ page }) => {
    const unique = `TestKat${Date.now()}`;

    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          intent: {
            name: "createCategory",
            args: { name: unique, kind: "expense", keywords: ["testkelime"] },
            needsConfirm: true,
          },
        }),
      }),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Asistanı aç" }).click();

    // Kural motorunun çözemeyeceği bir cümle: /api/chat'e gider.
    await page.getByLabel("Asistana yaz").fill("yeni bir kategori oluştur");
    await page.getByRole("button", { name: "Gönder" }).click();

    // Onay kartı alanları göstermeli — boş onay kartı olmaz.
    await expect(page.getByText(unique)).toBeVisible();

    await page.getByRole("button", { name: "Onayla" }).click();
    await expect(page.getByText("✓ Uygulandı")).toBeVisible({ timeout: 15_000 });

    // Gerçekten kaydedildi mi: kategoriler sayfasında görünmeli.
    await page.goto("/kategoriler");
    await expect(page.getByText(unique)).toBeVisible();
  });

});

/**
 * ── KAYIT SEÇİCİSİ ──
 *
 * Güncelleme/silme araçları kimlik taşımıyor: model kaydı TARİF
 * ediyor, adaylar istemcinin önbelleğinden bulunuyor ve kullanıcı
 * onay kartında seçiyor. Bu testler zinciri uçtan uca sınıyor.
 */
test.describe("asistan -- kayıt seçicisi", () => {
  /** `/api/chat`'in döndüreceği niyeti sırayla değiştirir. */
  async function mockIntents(page: Page) {
    const state: { next: Record<string, unknown> | null } = { next: null };
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ intent: { ...state.next, needsConfirm: true } }),
      }),
    );
    return state;
  }

  async function say(page: Page, text: string) {
    await page.getByLabel("Asistana yaz").fill(text);
    await page.getByRole("button", { name: "Gönder" }).click();
  }

  /** Testlerin saat dilimindeki bugün (playwright.config: Europe/Istanbul). */
  const today = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

  test("★ tek aday seçili gelir ve güncelleme uygulanır", async ({ page }) => {
    const unique = `SecKat${Date.now()}`;
    const state = await mockIntents(page);

    await page.goto("/");
    await page.getByRole("button", { name: "Asistanı aç" }).click();

    state.next = { name: "createCategory", args: { name: unique, kind: "expense" } };
    await say(page, "yeni bir kategori oluştur");
    await page.getByRole("button", { name: "Onayla" }).click();
    await expect(page.getByText("✓ Uygulandı")).toBeVisible({ timeout: 15_000 });

    state.next = {
      name: "updateCategory",
      args: { categoryName: unique, name: `${unique}Yeni` },
    };
    await say(page, "o kategorinin adını değiştir");

    // Tek aday: seçili gelir, ama kullanıcı yine de GÖRÜR.
    const radio = page.getByRole("radio", { name: new RegExp(unique) });
    await expect(radio).toBeChecked();

    await page.getByRole("button", { name: "Onayla" }).last().click();
    await expect(page.getByText("✓ Uygulandı")).toHaveCount(2, { timeout: 15_000 });

    await page.goto("/kategoriler");
    await expect(page.getByText(`${unique}Yeni`)).toBeVisible();
  });

  /**
   * Tarife uyan kayıt yoksa onay KAPALI. Eskiden model uydurma bir
   * kimlik üretiyor, silme sıfır satır etkileyip "uygulandı"
   * diyordu.
   */
  test("★ tarife uyan kayıt yoksa onaylanamaz", async ({ page }) => {
    const state = await mockIntents(page);
    state.next = {
      name: "deleteTransaction",
      args: { matchFrom: today(), matchTo: today(), matchNote: `yok-${Date.now()}` },
    };

    await page.goto("/");
    await page.getByRole("button", { name: "Asistanı aç" }).click();
    await say(page, "bugünkü o işlemi sil");

    await expect(page.getByText(/bulamadım/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Onayla" })).toBeDisabled();
  });

  /**
   * Birden fazla aday varsa HİÇBİRİ seçili gelmez: silmede "hepsi"
   * varsayımı yıkıcı. Kullanıcı işaretledikçe düğme sayıyı söyler.
   */
  test("★ birden fazla adayda seçim yapılmadan silinmez", async ({ page }) => {
    const note = `secici-${Date.now()}`;
    const state = await mockIntents(page);

    await page.goto("/");
    await page.getByRole("button", { name: "Asistanı aç" }).click();

    for (const amountKurus of [1_100, 2_200]) {
      state.next = {
        name: "createTransaction",
        args: { kind: "expense", amountKurus, date: today(), note },
      };
      await say(page, "bir gider ekle");
      await page.getByRole("button", { name: "Onayla" }).last().click();
    }
    await expect(page.getByText("✓ Uygulandı")).toHaveCount(2, { timeout: 15_000 });

    state.next = {
      name: "deleteTransaction",
      args: { matchFrom: today(), matchTo: today(), matchNote: note },
    };
    await say(page, "bugünkü o iki işlemi sil");

    const boxes = page.getByRole("checkbox");
    await expect(boxes).toHaveCount(2);
    for (const box of await boxes.all()) await expect(box).not.toBeChecked();

    const confirm = page.getByRole("button", { name: /onayla/i }).last();
    await expect(confirm).toBeDisabled();

    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(page.getByRole("button", { name: "2 kaydı onayla" })).toBeEnabled();
    await page.getByRole("button", { name: "2 kaydı onayla" }).click();
    await expect(page.getByText("✓ Uygulandı")).toHaveCount(3, { timeout: 15_000 });
  });
});
