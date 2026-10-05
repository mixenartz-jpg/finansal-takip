import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { DARK_TOKENS, TOKENS, oklchToSrgb, type Oklch } from "./colors";

/**
 * `themeColor` etiketi ile `bg` token'ının SENKRONU.
 *
 * ── NEDEN ELLE YAZILAN BİR HEX VAR ──
 *
 * Tarayıcı adres çubuğunu boyarken `<meta name="theme-color">`
 * etiketini okur. Bu etiket CSS'ten ÖNCE, `var(--bg)` daha
 * çözülmeden değerlendirilir; dolayısıyla token'a referans
 * veremez, sRGB hex'i elle yazılmak ZORUNDADIR.
 *
 * Elle yazılan her değer sessizce ayrışır: `colors.ts` içindeki
 * koyu zemin ayarlanır, `layout.tsx` eski hex'iyle kalır ve
 * telefonda çubuk ile sayfa arasında ince bir renk dikişi oluşur
 * — masaüstünde hiç görünmediği için gözden kaçar. Bu test tam
 * olarak böyle bir ayrışmayı yakaladı: token `#0e0f13` verirken
 * etikette `#121317` yazıyordu.
 *
 * `bg` token'ı değişirse burası kırmızı yanar ve hata mesajı
 * yazılması gereken yeni hex'i söyler.
 */

const hex = (t: Oklch): string =>
  "#" +
  oklchToSrgb(t)
    .map((v) => Math.round(v * 255).toString(16).padStart(2, "0"))
    .join("");

const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");

/**
 * `themeColor` dizisinden verilen şemanın rengini söker.
 *
 * Regex yerine düz metin araması: şema etiketini bul, o satırın
 * sonundaki `color: "#rrggbb"` değerini al. Kaçış karakteri
 * cehennemi olmadan okunur kalıyor.
 */
function themeColorFor(scheme: "light" | "dark"): string {
  const marker = `(prefers-color-scheme: ${scheme})`;
  const at = layout.indexOf(marker);
  expect(at, `layout.tsx içinde "${marker}" bulunamadı`).toBeGreaterThan(-1);

  const lineEnd = layout.indexOf("\n", at);
  const line = layout.slice(at, lineEnd === -1 ? undefined : lineEnd);

  const key = 'color: "';
  const keyAt = line.indexOf(key);
  expect(keyAt, `"${marker}" satırında color alanı yok: ${line}`).toBeGreaterThan(-1);

  const from = keyAt + key.length;
  const value = line.slice(from, line.indexOf('"', from));
  return value.toLowerCase();
}

describe("theme-color etiketi zemin token'ıyla eşleşir", () => {
  test("AÇIK tema çubuğu açık zeminle aynı", () => {
    const expected = hex(TOKENS.bg);
    expect(themeColorFor("light"), `layout.tsx açık theme-color ${expected} olmalı`).toBe(
      expected,
    );
  });

  test("KOYU tema çubuğu koyu zeminle aynı", () => {
    const expected = hex(DARK_TOKENS.bg);
    expect(themeColorFor("dark"), `layout.tsx koyu theme-color ${expected} olmalı`).toBe(
      expected,
    );
  });
});
