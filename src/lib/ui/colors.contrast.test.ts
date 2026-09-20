import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  TOKENS,
  DARK_TOKENS,
  contrastRatio,
  AA_NORMAL,
  AA_LARGE,
  type Oklch,
} from "./colors";

/**
 * Kontrast kapısı.
 *
 * Bir token'ın değerini değiştirmek okunabilirliği sessizce bozabilir:
 * tarayıcıda "biraz soluk" görünen bir gri, gerçekte 3:1 kontrastla
 * WCAG'ı ihlal ediyor olabilir ve bunu göz kararı fark etmek mümkün
 * değil. Bu test o kararı ölçüye bağlar.
 */

/** Gerçekten birlikte görünen çiftler — teorik değil, kullanılan. */
const PAIRS: { name: string; fg: Oklch; bg: Oklch; min: number }[] = [
  { name: "başlık / zemin", fg: TOKENS.ink, bg: TOKENS.bg, min: AA_NORMAL },
  { name: "GÖVDE metni / zemin", fg: TOKENS.ink2, bg: TOKENS.bg, min: AA_NORMAL },
  { name: "ikincil metin / zemin", fg: TOKENS.ink3, bg: TOKENS.bg, min: AA_NORMAL },
  { name: "gövde / yüzey", fg: TOKENS.ink2, bg: TOKENS.surface, min: AA_NORMAL },
  { name: "başlık / yüzey", fg: TOKENS.ink, bg: TOKENS.surface, min: AA_NORMAL },
  { name: "ikincil / yüzey-2", fg: TOKENS.ink3, bg: TOKENS.surface2, min: AA_NORMAL },

  { name: "marka bağlantı / zemin", fg: TOKENS.brand, bg: TOKENS.bg, min: AA_NORMAL },
  { name: "buton yazısı / marka", fg: TOKENS.onBrand, bg: TOKENS.brand, min: AA_NORMAL },
  { name: "tehlike butonu yazısı / tehlike", fg: TOKENS.onDanger, bg: TOKENS.danger, min: AA_NORMAL },
  { name: "marka mürekkep / marka yumuşak", fg: TOKENS.brandInk, bg: TOKENS.brandSoft, min: AA_NORMAL },

  { name: "GELİR tutarı / zemin", fg: TOKENS.income, bg: TOKENS.bg, min: AA_NORMAL },
  { name: "GİDER tutarı / zemin", fg: TOKENS.expense, bg: TOKENS.bg, min: AA_NORMAL },
  { name: "gelir / gelir yumuşak", fg: TOKENS.income, bg: TOKENS.incomeSoft, min: AA_NORMAL },
  { name: "gider / gider yumuşak", fg: TOKENS.expense, bg: TOKENS.expenseSoft, min: AA_NORMAL },
  { name: "gelir tutarı / yüzey", fg: TOKENS.income, bg: TOKENS.surface, min: AA_NORMAL },
  { name: "gider tutarı / yüzey", fg: TOKENS.expense, bg: TOKENS.surface, min: AA_NORMAL },

  { name: "UYARI / uyarı yumuşak", fg: TOKENS.warning, bg: TOKENS.warningSoft, min: AA_NORMAL },
  { name: "uyarı / zemin", fg: TOKENS.warning, bg: TOKENS.bg, min: AA_NORMAL },
  { name: "tehlike / zemin", fg: TOKENS.danger, bg: TOKENS.bg, min: AA_NORMAL },
];

describe("renk kontrastı -- WCAG AA", () => {
  for (const { name, fg, bg, min } of PAIRS) {
    test(`${name} >= ${min}:1`, () => {
      const ratio = contrastRatio(fg, bg);
      expect(
        ratio,
        `${name}: ${ratio.toFixed(2)}:1 (en az ${min}:1 olmalı)`,
      ).toBeGreaterThanOrEqual(min);
    });
  }
});

describe("kenarlıklar -- görünür olmalı", () => {
  test("kenarlık zeminden ayırt edilebilir", () => {
    // Kenarlık metin değil, AA_LARGE gerekmiyor; ama görünmezse
    // kartlar zemine karışır. 1.2:1 pratik alt sınır.
    expect(contrastRatio(TOKENS.border, TOKENS.bg)).toBeGreaterThan(1.2);
  });
  test("güçlü kenarlık normal kenarlıktan belirgin", () => {
    const strong = contrastRatio(TOKENS.borderStrong, TOKENS.bg);
    const normal = contrastRatio(TOKENS.border, TOKENS.bg);
    expect(strong).toBeGreaterThan(normal);
  });
});

describe("token senkronu -- CSS ile TS aynı değerleri taşımalı", () => {
  /**
   * `globals.css` ile `colors.ts` elle senkron tutuluyor. Biri
   * değişip diğeri unutulursa kontrast testleri GERÇEKTE KULLANILAN
   * renkleri değil, eski kopyayı doğrular — yani sessizce yalan söyler.
   * Bu test o ihtimali kapatır.
   */
  const css = readFileSync(
    resolve(import.meta.dirname, "../../app/globals.css"),
    "utf-8",
  );

  const CSS_VAR_BY_TOKEN: Partial<Record<keyof typeof TOKENS, string>> = {
    bg: "--bg",
    surface: "--surface",
    surface2: "--surface-2",
    border: "--border",
    borderStrong: "--border-strong",
    ink: "--ink",
    ink2: "--ink-2",
    ink3: "--ink-3",
    brand: "--brand",
    brandHover: "--brand-hover",
    brandSoft: "--brand-soft",
    brandInk: "--brand-ink",
    income: "--income",
    incomeSoft: "--income-soft",
    expense: "--expense",
    expenseSoft: "--expense-soft",
    warning: "--warning",
    warningSoft: "--warning-soft",
    danger: "--danger",
    onBrand: "--on-brand",
    onDanger: "--on-danger",
  };

  /**
   * CSS artık İKİ token kümesi taşıyor. Basit bir regex her
   * değişkenin İLK eşleşmesini bulur ve koyu tema bloğu sessizce
   * doğrulanmadan kalır — test yeşil görünürken hiçbir şey
   * doğrulamaz. Bu yüzden bloklar önce ayrılıyor.
   */
  function extractBlock(source: string, marker: string): string {
    const start = source.indexOf(marker);
    expect(start, `"${marker}" globals.css içinde bulunamadı`).toBeGreaterThan(-1);
    const open = source.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) return source.slice(open, i);
      }
    }
    throw new Error(`"${marker}" bloğu kapanmamış`);
  }

  const lightBlock = extractBlock(css, "/* THEME:LIGHT */");
  const darkBlock = extractBlock(css, "/* THEME:DARK */");

  function expectTokenInBlock(block: string, cssVar: string, expected: Oklch) {
    const re = new RegExp(
      `${cssVar.replace(/-/g, "\\-")}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`,
    );
    const m = block.match(re);
    expect(m, `${cssVar} blokta bulunamadı`).not.toBeNull();
    expect(Number(m![1]), `${cssVar} L`).toBeCloseTo(expected.l, 3);
    expect(Number(m![2]), `${cssVar} C`).toBeCloseTo(expected.c, 3);
    expect(Number(m![3]), `${cssVar} H`).toBeCloseTo(expected.h, 1);
  }

  for (const [token, cssVar] of Object.entries(CSS_VAR_BY_TOKEN)) {
    const key = token as keyof typeof TOKENS;
    test(`${cssVar} AÇIK temada TS ile aynı`, () => {
      expectTokenInBlock(lightBlock, cssVar!, TOKENS[key]);
    });
    test(`${cssVar} KOYU temada TS ile aynı`, () => {
      expectTokenInBlock(darkBlock, cssVar!, DARK_TOKENS[key]);
    });
  }
});

describe("koyu tema kontrastı -- WCAG AA", () => {
  const DARK_PAIRS: { name: string; fg: Oklch; bg: Oklch; min: number }[] = [
    { name: "başlık / zemin", fg: DARK_TOKENS.ink, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "GÖVDE metni / zemin", fg: DARK_TOKENS.ink2, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "ikincil metin / zemin", fg: DARK_TOKENS.ink3, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "gövde / yüzey", fg: DARK_TOKENS.ink2, bg: DARK_TOKENS.surface, min: AA_NORMAL },
    { name: "başlık / yüzey", fg: DARK_TOKENS.ink, bg: DARK_TOKENS.surface, min: AA_NORMAL },
    { name: "ikincil / yüzey-2", fg: DARK_TOKENS.ink3, bg: DARK_TOKENS.surface2, min: AA_NORMAL },

    { name: "marka bağlantı / zemin", fg: DARK_TOKENS.brand, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "marka mürekkep / marka yumuşak", fg: DARK_TOKENS.brandInk, bg: DARK_TOKENS.brandSoft, min: AA_NORMAL },

    { name: "GELİR tutarı / zemin", fg: DARK_TOKENS.income, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "GİDER tutarı / zemin", fg: DARK_TOKENS.expense, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "gelir / gelir yumuşak", fg: DARK_TOKENS.income, bg: DARK_TOKENS.incomeSoft, min: AA_NORMAL },
    { name: "gider / gider yumuşak", fg: DARK_TOKENS.expense, bg: DARK_TOKENS.expenseSoft, min: AA_NORMAL },
    { name: "gelir tutarı / yüzey", fg: DARK_TOKENS.income, bg: DARK_TOKENS.surface, min: AA_NORMAL },
    { name: "gider tutarı / yüzey", fg: DARK_TOKENS.expense, bg: DARK_TOKENS.surface, min: AA_NORMAL },

    { name: "UYARI / uyarı yumuşak", fg: DARK_TOKENS.warning, bg: DARK_TOKENS.warningSoft, min: AA_NORMAL },
    { name: "uyarı / zemin", fg: DARK_TOKENS.warning, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "tehlike / zemin", fg: DARK_TOKENS.danger, bg: DARK_TOKENS.bg, min: AA_NORMAL },
  ];

  for (const { name, fg, bg, min } of DARK_PAIRS) {
    test(`${name} >= ${min}:1`, () => {
      const ratio = contrastRatio(fg, bg);
      expect(
        ratio,
        `koyu ${name}: ${ratio.toFixed(2)}:1 (en az ${min}:1 olmalı)`,
      ).toBeGreaterThanOrEqual(min);
    });
  }

  /**
   * ── BUTON YAZISI ──
   *
   * Bu çift ilk yazıldığında ATLANMIŞTI ve gerçek bir hata kaçtı:
   * koyu temada birincil buton beyaz yazı + açık marka rengiyle
   * 2.52:1 veriyordu. Ekran görüntüsünde "biraz soluk" görünüyordu,
   * ölçünce AA eşiğinin çok altındaydı.
   *
   * Koyu temada buton yazısı KOYU olur (zemin rengi), beyaz değil —
   * `ui.tsx` bunu `--on-brand` token'ı üzerinden alır.
   */
  test("BİRİNCİL BUTON yazısı okunur (koyu tema)", () => {
    const ratio = contrastRatio(DARK_TOKENS.onBrand, DARK_TOKENS.brand);
    expect(
      ratio,
      `koyu buton yazısı: ${ratio.toFixed(2)}:1 (en az ${AA_NORMAL}:1)`,
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test("TEHLİKE BUTONU yazısı okunur (koyu tema)", () => {
    const ratio = contrastRatio(DARK_TOKENS.onDanger, DARK_TOKENS.danger);
    expect(
      ratio,
      `koyu tehlike butonu yazısı: ${ratio.toFixed(2)}:1 (en az ${AA_NORMAL}:1)`,
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test("koyu zemin gerçekten koyu", () => {
    expect(DARK_TOKENS.bg.l).toBeLessThan(0.3);
  });

  test("koyu tema açık temayla AYNI token kümesine sahip", () => {
    // Bir token koyuda eksik kalırsa o yüzey açık temadaki değerini
    // korur ve koyu ekranda beyaz bir leke olarak görünür.
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(Object.keys(TOKENS).sort());
  });

  test("koyu kenarlık zeminden ayırt edilebilir", () => {
    expect(contrastRatio(DARK_TOKENS.border, DARK_TOKENS.bg)).toBeGreaterThan(1.2);
  });
});
