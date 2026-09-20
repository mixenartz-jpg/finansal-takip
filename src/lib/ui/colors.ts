/**
 * Tasarım token'larının OKLCH değerleri — tek kaynak.
 *
 * ── NEDEN İKİ YERDE ──
 *
 * Değerler `globals.css` içinde CSS değişkeni olarak yaşıyor; burada
 * TS kopyası tutuluyor ki kontrast testleri onları okuyabilsin.
 * CSS'i node ortamında ayrıştırmak bir CSS parser bağımlılığı
 * gerektirirdi; iki listeyi senkron tutmak `colors.contrast.test.ts`
 * içindeki eşleşme testinin işi.
 *
 * Bu dosya çalışma zamanında kullanılmaz — bileşenler CSS
 * değişkenlerini doğrudan okur. Yalnızca doğrulama için var.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export const TOKENS = {
  bg: { l: 1, c: 0, h: 0 },
  surface: { l: 0.985, c: 0.002, h: 265 },
  surface2: { l: 0.965, c: 0.004, h: 265 },
  border: { l: 0.905, c: 0.005, h: 265 },
  borderStrong: { l: 0.82, c: 0.008, h: 265 },

  ink: { l: 0.21, c: 0.012, h: 265 },
  ink2: { l: 0.42, c: 0.011, h: 265 },
  ink3: { l: 0.53, c: 0.01, h: 265 },

  brand: { l: 0.47, c: 0.16, h: 266 },
  brandHover: { l: 0.42, c: 0.17, h: 266 },
  brandSoft: { l: 0.95, c: 0.025, h: 266 },
  brandInk: { l: 0.36, c: 0.15, h: 266 },

  income: { l: 0.48, c: 0.13, h: 152 },
  incomeSoft: { l: 0.955, c: 0.03, h: 152 },
  expense: { l: 0.52, c: 0.19, h: 25 },
  expenseSoft: { l: 0.96, c: 0.03, h: 25 },

  warning: { l: 0.5, c: 0.13, h: 75 },
  warningSoft: { l: 0.96, c: 0.04, h: 75 },
  danger: { l: 0.52, c: 0.19, h: 25 },

  /* ── Dolu buton yazısı ──
   * Açık temada marka/tehlike renkleri KOYU, üstüne beyaz yazı
   * gelir. Koyu temada bu renkler AÇIK olur ve beyaz yazı okunmaz
   * hale gelir (2.52:1 ölçüldü). Bu yüzden buton yazısı sabit
   * `text-white` değil, temaya göre değişen bir token. */
  onBrand: { l: 1, c: 0, h: 0 },
  onDanger: { l: 1, c: 0, h: 0 },
} as const satisfies Record<string, Oklch>;

export type TokenName = keyof typeof TOKENS;

/**
 * Koyu tema değerleri.
 *
 * ── TERS ÇEVİRME DEĞİL, YENİDEN HESAPLAMA ──
 *
 * Açık temanın lightness değerlerini 1'den çıkarmak ucuz görünür ama
 * yanlış sonuç verir: koyu zeminde aynı chroma cansız ve kirli
 * görünür, gelir yeşili ile gider kırmızısı birbirine yaklaşır.
 * Her değer koyu zemin için ayrı seçildi.
 *
 * ── ZEMİN SAF SİYAH DEĞİL ──
 *
 * L=0.17, saf siyah (L=0) değil. OLED'de saf siyah kaydırma sırasında
 * hayalet iz bırakır ve yüzey katmanları (surface/surface-2) siyahtan
 * ayrışamaz — kart sınırları kaybolur.
 */
export const DARK_TOKENS = {
  bg: { l: 0.17, c: 0.008, h: 265 },
  surface: { l: 0.21, c: 0.009, h: 265 },
  surface2: { l: 0.25, c: 0.01, h: 265 },
  border: { l: 0.32, c: 0.011, h: 265 },
  borderStrong: { l: 0.44, c: 0.013, h: 265 },

  ink: { l: 0.96, c: 0.003, h: 265 },
  ink2: { l: 0.86, c: 0.005, h: 265 },
  ink3: { l: 0.72, c: 0.008, h: 265 },

  brand: { l: 0.72, c: 0.14, h: 266 },
  brandHover: { l: 0.79, c: 0.13, h: 266 },
  brandSoft: { l: 0.27, c: 0.05, h: 266 },
  brandInk: { l: 0.82, c: 0.11, h: 266 },

  income: { l: 0.76, c: 0.16, h: 152 },
  incomeSoft: { l: 0.26, c: 0.05, h: 152 },
  expense: { l: 0.72, c: 0.16, h: 25 },
  expenseSoft: { l: 0.27, c: 0.06, h: 25 },

  warning: { l: 0.81, c: 0.14, h: 75 },
  warningSoft: { l: 0.28, c: 0.05, h: 75 },
  danger: { l: 0.72, c: 0.16, h: 25 },

  /* Koyu temada dolu butonun yazısı KOYU: açık marka rengi üstünde
   * beyaz yazı 2.52:1 veriyordu, zemin tonu 7.59:1 veriyor. */
  onBrand: { l: 0.17, c: 0.008, h: 265 },
  onDanger: { l: 0.17, c: 0.008, h: 265 },
} as const satisfies Record<TokenName, Oklch>;

/** OKLCH → sRGB (0..1 aralığında, gamut'a kırpılmış). */
export function oklchToSrgb({ l: L, c: C, h: hDeg }: Oklch): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const lc = l_ ** 3;
  const mc = m_ ** 3;
  const sc = s_ ** 3;

  const r = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bl = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc;

  const gamma = (x: number): number => {
    const v = Math.max(0, Math.min(1, x));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  };

  return [gamma(r), gamma(g), gamma(bl)];
}

/** WCAG bağıl parlaklık. */
export function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  const lin = (x: number): number =>
    x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** İki token arasındaki WCAG kontrast oranı. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(oklchToSrgb(a));
  const lb = relativeLuminance(oklchToSrgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA eşikleri. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
