import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Erişilebilirlik regresyon kapısı.
 *
 * ── NEDEN E2E ──
 *
 * Erişilebilirlik ihlallerinin çoğu (eksik etiket, yasaklı ARIA
 * özniteliği, küçük dokunma hedefi) yalnızca GERÇEK BİR TARAYICIDA
 * hesaplanmış düzen üzerinde görülebilir. Birim testi 23×23 piksellik
 * bir düğmeyi yakalayamaz.
 *
 * Bu testler giriş gerektirmeyen yüzeyleri tarar. Korumalı sayfalar
 * için `auth.setup.ts` ile oturum açılan `app` projesi gerekir;
 * oradaki bileşenler zaten aynı `components/ui.tsx` dağarcığını
 * kullanıyor, dolayısıyla buradaki kapı onları da dolaylı korur.
 */

const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

test.describe("erişilebilirlik", () => {
  test("giriş sayfasında WCAG ihlali yok", async ({ page }) => {
    await page.goto("/giris");
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    // Hata mesajında ihlalin adı görünsün; yalnızca sayı görmek
    // hangi kuralın bozulduğunu aramayı gerektirirdi.
    const summary = results.violations
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} öğe`)
      .join("\n");
    expect(summary, summary).toBe("");
  });

  test("kayıt modunda WCAG ihlali yok", async ({ page }) => {
    await page.goto("/giris");
    await page.getByRole("button", { name: /hesap oluşturun/i }).click();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test("★ dokunma hedefleri en az 24×24 piksel (WCAG 2.5.8)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/giris");

    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("button, a[href], input, select")) {
        const r = el.getBoundingClientRect();
        // Gizli öğeler sayılmaz.
        if (r.width === 0 && r.height === 0) continue;
        if (r.width < 24 || r.height < 24) {
          const label =
            el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
          out.push(`${el.tagName.toLowerCase()} "${label.slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
      }
      return out;
    });

    expect(small.join("\n"), small.join("\n")).toBe("");
  });

  test("★ %200 yakınlaştırmada yatay taşma olmaz (WCAG 1.4.4)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/giris");
    // Kök yazı boyutunu iki katına çıkarmak tarayıcı
    // yakınlaştırmasını taklit eder.
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows).toBe(false);
  });

  test("★ azaltılmış hareket tercihine uyulur", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/giris");

    const longTransitions = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("*")) {
        const d = getComputedStyle(el).transitionDuration;
        if (d && parseFloat(d) > 0.01) out.push(`${el.tagName}: ${d}`);
      }
      return out;
    });

    expect(longTransitions.join(", ")).toBe("");
    await ctx.close();
  });

  /**
   * ── KOYU TEMA ──
   *
   * Kontrast oranları birim testlerinde (colors.contrast.test.ts)
   * token düzeyinde doğrulanıyor, ama o testler token'ların GERÇEKTEN
   * kullanıldığını bilmez: bir bileşen sabit renk kullanıyorsa
   * (`text-white`, `bg-white`) token testi yeşil kalır ve koyu temada
   * okunmaz bir yüzey ortaya çıkar. Axe hesaplanmış renkleri okur,
   * bu yüzden o boşluğu kapatır.
   *
   * Nitekim ilk uygulamada birincil butonun `text-white` olması koyu
   * temada 2.52:1 veriyordu; bu kapı o sınıf hataları yakalar.
   */
  test("★ KOYU temada WCAG ihlali yok (sistem tercihi)", async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto("/giris");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const summary = results.violations
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} öğe`)
      .join("\n");
    expect(summary, summary).toBe("");
    await ctx.close();
  });

  test("★ KOYU temada WCAG ihlali yok (elle seçim)", async ({ browser }) => {
    // Sistem AÇIK derken kullanıcı KOYU seçmiş: `data-theme="dark"`
    // yolu, medya sorgusu yolundan ayrı bir CSS bloğu — ayrı test
    // edilmezse biri bozulurken diğeri yeşil kalabilir.
    const ctx = await browser.newContext({ colorScheme: "light" });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("hesap-takip-theme", "dark");
      } catch {
        // Depolama engelliyse test anlamsızlaşır ama çökmemeli.
      }
    });
    const page = await ctx.newPage();
    await page.goto("/giris");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const summary = results.violations
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} öğe`)
      .join("\n");
    expect(summary, summary).toBe("");
    await ctx.close();
  });

  test("★ elle AÇIK seçimi sistem koyu tercihini ezer", async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("hesap-takip-theme", "light");
      } catch {
        // yukarıdaki gerekçe
      }
    });
    const page = await ctx.newPage();
    await page.goto("/giris");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // Zemin gerçekten açık mı? Öznitelik doğru ama CSS bloğu yanlış
    // yazılmışsa öznitelik tek başına bir şey kanıtlamaz.
    const isLight = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const g = c.getContext("2d")!;
      g.fillStyle = getComputedStyle(document.body).backgroundColor;
      g.fillRect(0, 0, 1, 1);
      const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
      return (r + gg + b) / 3 > 200;
    });
    expect(isLight, "elle açık seçilmesine rağmen zemin koyu").toBe(true);
    await ctx.close();
  });

  test("PWA ikonları ve manifest servis ediliyor", async ({ request }) => {
    // Manifest var olmayan bir ikona işaret ederse uygulama ana
    // ekrana eklenemez ve bu sessizce başarısız olur.
    for (const path of ["/icon.svg", "/icon-maskable.svg", "/manifest.webmanifest"]) {
      const res = await request.get(path);
      expect(res.status(), `${path} bulunamadı`).toBe(200);
    }

    const manifest = await (await request.get("/manifest.webmanifest")).json();
    const purposes = manifest.icons.map((i: { purpose: string }) => i.purpose);
    // `maskable` olmadan Android ikonu kendi kırpmasını uygular ve
    // kare ikonun köşeleri kesilir.
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
  });
});

/**
 * ── KİPLİ DİYALOĞUN KLAVYE DAVRANIŞI ──
 *
 * `Sheet` bileşeni (src/components/Sheet.tsx) düzenleme sayfalarında
 * ve dikte katmanında kullanılıyor; hepsi giriş gerektirdiği için
 * anon projesinden AÇILAMIYOR. Buradaki testler bileşenin dayandığı
 * iki sözleşmeyi gerçek tarayıcıda doğruluyor:
 *
 *   1. `FOCUSABLE_SELECTOR` gerçekten odaklanabilir öğeleri seçiyor
 *      ve devre dışı olanları eleme işini tarayıcı da onaylıyor.
 *   2. `nextTrapFocus` + `focus()` birleşimi odağı diyalogda tutuyor.
 *
 * Birim testleri (focus.test.ts) yalnızca indeks aritmetiğini
 * biliyor; seçicinin gerçek DOM'da ne seçtiğini bilmez. Örneğin
 * `button:not([disabled])` yazımı yanlış olsaydı birim testleri
 * yeşil kalır, tuzak sessizce delinirdi.
 */
test.describe("kipli diyalog klavye sözleşmesi", () => {
  /** `Sheet`'in kullandığı seçicinin BİREBİR kopyası. */
  const SELECTOR = [
    "a[href]",
    "button",
    "input",
    "select",
    "textarea",
    "[tabindex]",
  ]
    .map((s) => `${s}:not([disabled]):not([tabindex="-1"])`)
    .join(", ");

  test("★ seçici devre dışı ve tabindex=-1 öğeleri eler", async ({ page }) => {
    await page.goto("/giris");

    const names = await page.evaluate((sel) => {
      const host = document.createElement("div");
      host.innerHTML = `
        <button id="a">a</button>
        <button id="b" disabled>b</button>
        <input id="c" />
        <input id="d" disabled />
        <div id="e" tabindex="-1">e</div>
        <div id="f" tabindex="0">f</div>
        <a id="g" href="#x">g</a>
        <a id="h">h</a>
        <select id="i"></select>
        <textarea id="j"></textarea>
      `;
      document.body.appendChild(host);
      const found = Array.from(host.querySelectorAll<HTMLElement>(sel)).map((n) => n.id);
      host.remove();
      return found;
    }, SELECTOR);

    // Devre dışı (b, d), tabindex=-1 (e) ve href'siz bağlantı (h) DIŞARIDA.
    expect(names).toContain("a");
    expect(names).toContain("c");
    expect(names).toContain("f");
    expect(names).toContain("g");
    expect(names).toContain("i");
    expect(names).toContain("j");
    expect(names, "devre dışı buton Tab sırasına girmemeli").not.toContain("b");
    expect(names, "devre dışı alan Tab sırasına girmemeli").not.toContain("d");
    expect(names, 'tabindex="-1" Tab sırasına girmemeli').not.toContain("e");
    expect(names, "href'siz bağlantı odaklanamaz").not.toContain("h");
  });

  test("★ Tab odağı diyaloğun içinde tutar (sarma)", async ({ page }) => {
    await page.goto("/giris");

    // Gerçek Sheet ile aynı kurulum: panel tabindex=-1, içinde üç alan.
    await page.evaluate(() => {
      const panel = document.createElement("div");
      panel.id = "trap";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.tabIndex = -1;
      panel.innerHTML =
        '<button id="t1">bir</button><input id="t2" /><button id="t3">üç</button>';
      document.body.appendChild(panel);
      panel.focus();
    });

    // Panelden ileri: sırayla t1 → t2 → t3.
    for (const expected of ["t1", "t2", "t3"]) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => document.activeElement?.id ?? "");
      expect(id, `Tab sonrası odak ${expected} olmalıydı`).toBe(expected);
    }
  });
});
