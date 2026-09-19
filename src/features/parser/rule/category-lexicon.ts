/**
 * Yerleşik kategori anahtar kelimeleri.
 *
 * Anahtar = varsayılan kategori adı (0006_seed_categories.sql ile aynı
 * yazım). Değer = o kategoriye işaret eden kelimeler, `normalize()`
 * geçmiş biçimde (aksansız, küçük harf).
 *
 * ── BU SÖZLÜK NEDEN KODDA ──
 *
 * Herkes için aynı olan bilgi burada; kullanıcıya özel olan
 * `categories.keywords` sütununda. "migros" kelimesinin market
 * demek olduğu evrensel, ama kullanıcının kategoriyi "Market" mi
 * "Gıda" mı adlandırdığı değil. İki kaynak birleştirilerek kullanılır
 * (bkz. category.ts).
 *
 * ── KATEGORİ SİNYALİ INTENT'İ DE ETKİLER ──
 *
 * Bir gider kategorisi eşleşmesi, "aldım" gibi belirsiz fiillerin
 * yönünü belirler: "200 tl yemek aldım" → yemek bir gider kategorisi,
 * dolayısıyla gider. Bu yüzden `kind` alanı sözlükte tutulur.
 */

export interface LexiconEntry {
  /** Varsayılan kategori adı — kullanıcının kategorisiyle eşleştirilir. */
  category: string;
  kind: "income" | "expense";
  keywords: readonly string[];
}

export const CATEGORY_LEXICON: readonly LexiconEntry[] = [
  // ── Gelir ──
  {
    category: "Maaş",
    kind: "income",
    keywords: ["maas", "maasim", "maasimi", "ucret", "aylik", "emekli maasi"],
  },
  {
    category: "Ek Gelir",
    kind: "income",
    keywords: ["ek gelir", "prim", "ikramiye", "bonus", "freelance", "ek is", "yan gelir"],
  },
  {
    category: "Faiz",
    kind: "income",
    keywords: ["faiz", "getiri", "temettu", "kar payi", "mevduat", "yatirim geliri"],
  },

  // ── Gider ──
  {
    category: "Yemek",
    kind: "expense",
    keywords: [
      "yemek", "yemege", "yemegi", "restoran", "lokanta", "kahvalti",
      "ogle yemegi", "aksam yemegi", "kahve", "cafe", "kafe", "doner",
      "pizza", "burger", "yemeksepeti", "getir yemek", "tatli", "pasta",
    ],
  },
  {
    category: "Market",
    kind: "expense",
    keywords: [
      "market", "markete", "marketten", "bakkal", "manav", "sarkuteri",
      "migros", "bim", "a101", "sok", "carrefour", "macrocenter",
      "alisveris", "gida", "ekmek", "sut", "meyve", "sebze",
    ],
  },
  {
    category: "Ulaşım",
    kind: "expense",
    keywords: [
      "ulasim", "otobus", "metro", "metrobus", "vapur", "dolmus",
      "taksi", "taksiye", "uber", "bitaksi", "benzin", "mazot", "yakit",
      "akbil", "istanbulkart", "bilet", "otopark", "kopru", "otoyol", "hgs",
    ],
  },
  {
    category: "Fatura",
    kind: "expense",
    keywords: [
      "fatura", "faturasi", "elektrik", "su faturasi", "dogalgaz", "gaz",
      "internet", "telefon", "telefon faturasi", "aidat", "cep telefonu",
      "turkcell", "vodafone", "turk telekom",
    ],
  },
  {
    category: "Kira",
    kind: "expense",
    keywords: ["kira", "kirayi", "kiraya", "ev kirasi", "kiram", "kiramizi"],
  },
  {
    category: "Sağlık",
    kind: "expense",
    keywords: [
      "saglik", "doktor", "eczane", "ilac", "hastane", "muayene",
      "dis", "disci", "tahlil", "gozluk", "lens", "ameliyat",
    ],
  },
  {
    category: "Giyim",
    kind: "expense",
    keywords: [
      "giyim", "kiyafet", "ayakkabi", "pantolon", "gomlek", "elbise",
      "mont", "tisort", "canta", "zara", "lcw", "defacto", "koton",
    ],
  },
  {
    category: "Eğlence",
    kind: "expense",
    keywords: [
      "eglence", "sinema", "konser", "tiyatro", "oyun", "netflix",
      "spotify", "abonelik", "mac", "bilet", "tatil", "gezi", "bar",
    ],
  },
  {
    category: "Eğitim",
    kind: "expense",
    keywords: [
      "egitim", "kurs", "kitap", "ders", "okul", "universite",
      "harc", "yurt", "kirtasiye", "sinav", "udemy",
    ],
  },
];

/**
 * Metinde herhangi bir GİDER kategorisi sinyali var mı.
 *
 * `intent.ts` bunu "aldım" belirsizliğini çözmek için kullanır:
 * "200 tl yemek aldım" → "yemek" bir gider kategorisi → gider.
 */
export function hasExpenseCategorySignal(normalizedText: string): boolean {
  return CATEGORY_LEXICON.some(
    (e) => e.kind === "expense" && e.keywords.some((k) => normalizedText.includes(k)),
  );
}

/** Metinde herhangi bir GELİR kategorisi sinyali var mı. */
export function hasIncomeCategorySignal(normalizedText: string): boolean {
  return CATEGORY_LEXICON.some(
    (e) => e.kind === "income" && e.keywords.some((k) => normalizedText.includes(k)),
  );
}
