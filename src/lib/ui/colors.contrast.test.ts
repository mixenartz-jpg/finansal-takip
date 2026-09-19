import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TOKENS, contrastRatio, AA_NORMAL, AA_LARGE, type Oklch } from "./colors";

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
  { name: "buton yazısı / marka", fg: TOKENS.bg, bg: TOKENS.brand, min: AA_NORMAL },
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
  };

  for (const [token, cssVar] of Object.entries(CSS_VAR_BY_TOKEN)) {
    test(`${cssVar} CSS'te TS ile aynı`, () => {
      const re = new RegExp(
        `${cssVar!.replace(/-/g, "\\-")}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`,
      );
      const m = css.match(re);
      expect(m, `${cssVar} globals.css içinde bulunamadı`).not.toBeNull();

      const t = TOKENS[token as keyof typeof TOKENS];
      expect(Number(m![1]), `${cssVar} L`).toBeCloseTo(t.l, 3);
      expect(Number(m![2]), `${cssVar} C`).toBeCloseTo(t.c, 3);
      expect(Number(m![3]), `${cssVar} H`).toBeCloseTo(t.h, 1);
    });
  }
});
