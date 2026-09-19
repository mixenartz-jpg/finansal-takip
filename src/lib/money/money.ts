import { type Kurus, KURUS_PER_LIRA, MAX_KURUS } from "./types";

/** Nötr eleman. `asKurus(0)` yazmak yerine okunur bir isim. */
export const ZERO_KURUS = 0 as Kurus;

/**
 * Düz sayıyı `Kurus` olarak işaretler ve geçerliliğini doğrular.
 *
 * Bu, marka tipine giren TEK kapı. Doğrudan `x as Kurus` yazmak
 * doğrulamayı atlar; kod tabanında bu dosyanın dışında `as Kurus`
 * aranmamalı.
 *
 * Negatife izin verilir: kredi kartı bakiyesi ve hesap deltası
 * negatif olabilir. Yasak olan yalnızca `transactions.amount_kurus`
 * ve onu SQL `check (amount_kurus > 0)` koruyor.
 */
export function asKurus(n: number): Kurus {
  if (!Number.isInteger(n)) {
    throw new Error(`Kuruş tam sayı olmalı, alınan: ${n}`);
  }
  if (Math.abs(n) > MAX_KURUS) {
    throw new Error(`Tutar güvenli sayı sınırını aşıyor: ${n}`);
  }
  return n as Kurus;
}

/**
 * Lira → kuruş. Float girdinin uygulamaya girdiği TEK meşru kapı.
 *
 * `Math.round` şart: `1234.56 * 100` bazı değerlerde
 * `123455.99999999999` verir ve `Math.trunc` bir kuruş kaybettirirdi.
 */
export function liraToKurus(lira: number): Kurus {
  if (!Number.isFinite(lira)) {
    throw new Error(`Geçersiz lira tutarı: ${lira}`);
  }
  return asKurus(Math.round(lira * KURUS_PER_LIRA));
}

/**
 * Kuruş → lira.
 *
 * YALNIZCA gösterim ve grafik ekseni için. Hiçbir toplama/çıkarma
 * lira üzerinde yapılmaz; bu fonksiyonun çıktısı asla geri kuruşa
 * çevrilip saklanmaz.
 */
export function kurusToLira(k: Kurus): number {
  return k / KURUS_PER_LIRA;
}

export function addKurus(a: Kurus, b: Kurus): Kurus {
  return asKurus(a + b);
}

export function subKurus(a: Kurus, b: Kurus): Kurus {
  return asKurus(a - b);
}

export function sumKurus(list: readonly Kurus[]): Kurus {
  let total = 0;
  for (const k of list) total += k;
  return asKurus(total);
}

export function negateKurus(k: Kurus): Kurus {
  return asKurus(-k);
}

/**
 * Biçimlendirici örnekleri modül düzeyinde kurulur.
 *
 * `Intl.NumberFormat` kurulumu pahalıdır ve işlem listesi her satırda
 * bunu çağırır; 200 satırlık bir listede her render'da 200 kurulum
 * yapmak fark edilir bir yavaşlama demektir.
 */
const TRY_FORMAT = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TRY_FORMAT_NO_FRACTION = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Intl "1.234,56 ₺" yerine bazı ortamlarda "₺1.234,56" üretir ve
 * araya dar boşluk (U+00A0 / U+202F) koyar. Uygulama tek bir biçim
 * gösterir: tutar, normal boşluk, simge.
 */
function normalizeTRY(formatted: string): string {
  const cleaned = formatted.replace(/[\u00a0\u202f]/g, " ").trim();
  const symbolFirst = cleaned.match(/^₺\s*(.+)$/);
  if (symbolFirst) return `${symbolFirst[1]} ₺`;
  return cleaned.replace(/\s*₺$/, " ₺");
}

/** `"1.234,56 ₺"` — kuruş her zaman görünür. */
export function formatTRY(k: Kurus): string {
  return normalizeTRY(TRY_FORMAT.format(kurusToLira(k)));
}

/**
 * `"40.000 ₺"` — kuruş sıfırsa gizlenir.
 *
 * Özet kartlarında ve grafik eksenlerinde kullanılır: "40.000,00 ₺"
 * iki hane gürültü ekler ve göz tutarları hızlı taramayı bırakır.
 */
export function formatTRYCompact(k: Kurus): string {
  const hasFraction = k % KURUS_PER_LIRA !== 0;
  const fmt = hasFraction ? TRY_FORMAT : TRY_FORMAT_NO_FRACTION;
  return normalizeTRY(fmt.format(kurusToLira(k)));
}

export type SignKind = "income" | "expense" | "transfer";

/**
 * İşaretli gösterim. `"+40.000 ₺"` / `"−200 ₺"`.
 *
 * Eksi için U+2212 MATEMATİK EKSİ kullanılır, ASCII kısa çizgi (-)
 * değil: kısa çizgi rakamlardan dar ve alçaktır, tabular hizalanmış
 * bir tutar sütununda satırlar birbirinden kayık görünür.
 *
 * Transfer işaretsizdir — kendi hesapları arasında para taşımak ne
 * gelir ne giderdir, işaret koymak yanlış bilgi verirdi.
 */
export function formatTRYSigned(k: Kurus, kind: SignKind): string {
  const body = formatTRYCompact(k);
  if (kind === "income") return `+${body}`;
  if (kind === "expense") return `\u2212${body}`;
  return body;
}

/**
 * Kullanıcının FORMA YAZDIĞI metni ayrıştırır.
 *
 * Parser'ın konuşmadan tutar çıkaran fonksiyonundan (features/parser)
 * bilinçli olarak AYRI: burada girdi kısa ve biçimli, orada bir cümle.
 * Tek fonksiyonda birleştirmek ikisini de bulanıklaştırırdı.
 *
 * Kabul edilenler: "1.234,56" · "1234,56" · "1234.56" · "1234" ·
 * "40.000" · "200 TL" · " 1.234,56 ₺ "
 *
 * Belirsizlik kuralı: son ayraçtan sonra 1–2 hane varsa o ayraç
 * ondalıktır ("1.234,56" ve "1234.56"); 3 hane varsa binliktir
 * ("40.000" = kırk bin, kırk lira değil).
 */
export function parseTRYInput(text: string): Kurus | null {
  const cleaned = text
    .replace(/[₺\s]/g, "")
    .replace(/tl$/i, "")
    .replace(/lira$/i, "")
    .trim();

  if (cleaned === "") return null;
  if (!/^-?[\d.,]+$/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const digits = negative ? cleaned.slice(1) : cleaned;

  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);

  // Ayrac YAPISI dogrulanir, yalnizca sonuncusuna bakmak yetmez.
  // "1,2,3" son ayraca gore "1230" uretirdi: gercekte bu bir yazim
  // hatasi ve sessizce sayiya cevirmek kullaniciya yanlis tutar
  // kaydettirir. Gecerli sekiller:
  //   - ayracsiz            "1234"
  //   - tek ondalik ayraci  "1234,56"
  //   - binlik gruplari     "1.234.567" ya da "1.234.567,89"
  // Binlik gruplarinda ilk grup 1-3, sonrakiler tam 3 hane olmali.
  const sepCount = (digits.match(/[.,]/g) ?? []).length;
  if (sepCount > 1) {
    const tailLen = digits.length - lastSep - 1;
    // Son ayrac ondaliksa onu ayir, kalan kisim saf binlik olmali.
    const groupPart =
      tailLen === 3 ? digits : digits.slice(0, lastSep);
    const groupSep = groupPart.includes(".") ? "." : ",";
    // Binlik ayraci tek tur olmali: "1.234,567.89" gecersiz.
    const otherSep = groupSep === "." ? "," : ".";
    if (groupPart.includes(otherSep)) return null;
    const groups = groupPart.split(groupSep);
    if (groups.length < 2) return null;
    if (!/^\d{1,3}$/.test(groups[0])) return null;
    if (!groups.slice(1).every((g) => /^\d{3}$/.test(g))) return null;
  }

  let integerPart: string;
  let fractionPart: string;

  if (lastSep === -1) {
    integerPart = digits;
    fractionPart = "";
  } else {
    const tail = digits.slice(lastSep + 1);
    if (tail.length === 3) {
      // Binlik ayracı: "40.000" → 40000, ondalık yok.
      integerPart = digits.replace(/[.,]/g, "");
      fractionPart = "";
    } else if (tail.length === 1 || tail.length === 2) {
      integerPart = digits.slice(0, lastSep).replace(/[.,]/g, "");
      fractionPart = tail;
    } else {
      // 0 veya 4+ hane: "12,3456" gibi girdi anlamsız.
      return null;
    }
  }

  if (integerPart === "" && fractionPart === "") return null;
  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(fractionPart)) return null;

  const lira = Number(integerPart === "" ? "0" : integerPart);
  const kurusPart = Number(fractionPart.padEnd(2, "0").slice(0, 2) || "0");
  if (!Number.isFinite(lira) || !Number.isFinite(kurusPart)) return null;

  const total = lira * KURUS_PER_LIRA + kurusPart;
  return asKurus(negative ? -total : total);
}

/**
 * Bütçe ilerlemesi için yüzde. Bölen sıfırsa 0 döner — limitsiz bir
 * kategori "sonsuz doluluk" göstermemeli.
 *
 * 100'ün üstü kasıtlı olarak kırpılmaz: aşım miktarı bilgidir, çubuğu
 * kırpmak gösterim katmanının işi.
 */
export function percentOf(part: Kurus, whole: Kurus): number {
  if (whole === 0) return 0;
  return (part / whole) * 100;
}
