import { normalize } from "@/lib/text/normalize";
import type { ParseCategory, Span } from "../types";
import { CATEGORY_LEXICON } from "./category-lexicon";

export interface CategoryMatch {
  categoryId: string;
  categoryName: string;
  confidence: number;
  span: Span | null;
  /** Eşleşmeyi sağlayan kelime — onay kartında gösterilir. */
  matchedKeyword: string;
}

/**
 * Bir anahtar kelimenin ham metindeki konumunu bulur.
 *
 * `normalize()` uzunluğu koruyan bir dönüşüm DEĞİLDİR (NFD ayrıştırması
 * karakter ekleyebilir), bu yüzden normalize edilmiş metindeki indeks
 * ham metne doğrudan uygulanamaz. Bunun yerine ham metin kelime kelime
 * gezilir ve her kelime ayrı ayrı normalize edilerek karşılaştırılır.
 */
function findKeywordSpan(rawText: string, keyword: string): Span | null {
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawText)) !== null) {
    const normalized = normalize(m[0].replace(/[^\p{L}\p{N}]/gu, ""));
    if (normalized === keyword || normalized.startsWith(keyword)) {
      return { start: m.index, end: m.index + m[0].length };
    }
  }
  // Çok kelimeli anahtar ("ek gelir") tek kelime taramasıyla bulunamaz;
  // konum bilgisi olmadan da eşleşme geçerlidir.
  return null;
}

/**
 * Cümleden kategoriyi bulur.
 *
 * ── İKİ KAYNAK, BELİRLİ ÖNCELİK ──
 *
 * 1. Kullanıcının kendi `keywords` listesi (categories.keywords sütunu)
 * 2. Yerleşik sözlük (category-lexicon.ts)
 *
 * Kullanıcının kendi kelimesi ÖNCE denenir ve daha yüksek güven alır:
 * "migros" kelimesini kendi "Gıda" kategorisine bağlamışsa, yerleşik
 * sözlüğün onu "Market"e göndermesi yanlış olur — kullanıcının kendi
 * düzeni her zaman kazanır.
 *
 * ── TÜR FİLTRESİ ──
 *
 * `kind` verilmişse yalnızca o türdeki kategoriler aranır. Gelir
 * işlemine gider kategorisi atamak veritabanı trigger'ı tarafından
 * zaten reddedilirdi (`check_category_kind`); burada engellemek
 * kullanıcıya daha erken ve anlaşılır geri bildirim verir.
 */
export function findCategory(
  rawText: string,
  categories: readonly ParseCategory[],
  kind: "income" | "expense" | null,
): CategoryMatch | null {
  const text = normalize(rawText);
  const pool = kind ? categories.filter((c) => c.kind === kind) : categories;
  if (pool.length === 0) return null;

  // ── 1. Kullanıcının kendi anahtar kelimeleri ──
  // Uzun kelime önce denenir: "ek gelir" varken "gelir"e düşmemeli.
  const userMatches: { cat: ParseCategory; kw: string }[] = [];
  for (const cat of pool) {
    for (const kw of cat.keywords) {
      const nk = normalize(kw);
      if (nk.length >= 3 && text.includes(nk)) {
        userMatches.push({ cat, kw: nk });
      }
    }
  }
  if (userMatches.length > 0) {
    userMatches.sort((a, b) => b.kw.length - a.kw.length);
    const best = userMatches[0];
    return {
      categoryId: best.cat.id,
      categoryName: best.cat.name,
      confidence: 0.95,
      span: findKeywordSpan(rawText, best.kw),
      matchedKeyword: best.kw,
    };
  }

  // ── 2. Kategori ADININ kendisi geçiyor mu ──
  const byName = pool.find((c) => {
    const n = normalize(c.name);
    return n.length >= 3 && text.includes(n);
  });
  if (byName) {
    const n = normalize(byName.name);
    return {
      categoryId: byName.id,
      categoryName: byName.name,
      confidence: 0.9,
      span: findKeywordSpan(rawText, n),
      matchedKeyword: n,
    };
  }

  // ── 3. Yerleşik sözlük ──
  const lexMatches: { entry: (typeof CATEGORY_LEXICON)[number]; kw: string }[] = [];
  for (const entry of CATEGORY_LEXICON) {
    if (kind && entry.kind !== kind) continue;
    for (const kw of entry.keywords) {
      if (text.includes(kw)) lexMatches.push({ entry, kw });
    }
  }
  if (lexMatches.length === 0) return null;

  lexMatches.sort((a, b) => b.kw.length - a.kw.length);
  const bestLex = lexMatches[0];

  // Sözlükteki varsayılan adı kullanıcının gerçek kategorisine bağla.
  const target = pool.find(
    (c) => normalize(c.name) === normalize(bestLex.entry.category),
  );
  if (!target) return null;

  return {
    categoryId: target.id,
    categoryName: target.name,
    confidence: 0.8,
    span: findKeywordSpan(rawText, bestLex.kw),
    matchedKeyword: bestLex.kw,
  };
}
