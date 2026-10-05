/**
 * Ad → kimlik çözümlemesi.
 *
 * ── NEDEN BU KATMAN VAR ──
 *
 * Gemini'ye yalnızca ADLAR gönderiyoruz (bkz. `prompt.ts`: kimlik
 * sızdırmanın karşılığı yok). Mutation hook'ları ise KİMLİK
 * istiyor. Arada bir çeviri şart ve o çeviri güvenilmez girdiyle
 * çalışıyor: model listede olmayan bir ad uydurabilir.
 *
 * ── NEDEN null DEĞİL, HATA ──
 *
 * Çözümlenemeyen ad sessizce `null`'a çevrilirse işlem yanlış
 * hesaba yazılır ya da kategorisiz kaydedilir. Kullanıcı bunu
 * aylar sonra raporda, sebebini anlamadan görür. Onay kartında
 * "şu adı bulamadım" demek çok daha iyi.
 */

/** Çözümlenebilir her kayıt: kimliği ve adı olan şey. */
export interface NamedRecord {
  id: string;
  name: string;
}

export type ResolveResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Türkçe duyarlı küçük harfe çevirme.
 *
 * ── NEDEN `toLowerCase()` DEĞİL ──
 *
 * JavaScript'in varsayılan `toLowerCase()` İngilizce kurallarını
 * uygular: `"ULAŞIM".toLowerCase()` → `"ulaşim"` (noktalı i), ama
 * Türkçede "I"nın küçüğü "ı"dır. Model kategoriyi büyük harfle
 * yazdığında ("ULAŞIM") kayıtlı "Ulaşım" ile eşleşmez ve kategori
 * bulunamaz — sebebi de hiçbir yerde görünmez.
 */
export function trLower(s: string): string {
  return s.trim().toLocaleLowerCase("tr");
}

/** İlk üç seçeneği kullanıcıya önerir — hata mesajını şişirmeden. */
function hint(records: readonly NamedRecord[]): string {
  if (records.length === 0) return "Kayıtlı bir şey bulamadım.";
  const names = records.slice(0, 3).map((r) => r.name);
  const more = records.length > 3 ? ` (ve ${records.length - 3} tane daha)` : "";
  return `Seçenekler: ${names.join(", ")}${more}.`;
}

/**
 * Adı kimliğe çevirir.
 *
 * Eşleşme büyük/küçük harf duyarsız ve Türkçe kurallarına göre
 * yapılır. Birden fazla kayıt aynı ada sahipse SEÇİM YAPILMAZ:
 * yanlış olanı seçmek, kullanıcıya sormaktan kötüdür.
 */
export function resolveName(name: string, records: readonly NamedRecord[]): ResolveResult {
  const needle = trLower(name);
  if (!needle) {
    return { ok: false, error: "Hangisini kastettiğini anlayamadım." };
  }

  const matches = records.filter((r) => trLower(r.name) === needle);

  if (matches.length === 1) return { ok: true, id: matches[0].id };

  if (matches.length > 1) {
    return {
      ok: false,
      error: `"${name.trim()}" adında birden fazla kayıt var, hangisini kastettin?`,
    };
  }

  return {
    ok: false,
    error: `"${name.trim()}" bulunamadı. ${hint(records)}`,
  };
}
