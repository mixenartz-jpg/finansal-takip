import type { Span } from "../types";

/**
 * Dolgu kelimeleri — açıklamaya değer katmayan parçalar.
 *
 * Tutar/tarih/kategori zaten kendi alanlarında saklanıyor; açıklama
 * yalnızca ONLARDAN ARTA KALAN bilgiyi taşımalı. "200 tl yemek aldım"
 * cümlesinde her parça bir alana gitti, açıklama boş kalmalı —
 * cümlenin tamamını not olarak yazmak listede gürültü üretir.
 */
const FILLER = new Set([
  "tl", "lira", "try", "₺", "tele",
  "aldim", "aldik", "aldi", "odedim", "odedik", "odedi",
  "verdim", "verdik", "verdi", "harcadim", "harcadik",
  "geldi", "yatti", "yatirdi", "kazandim", "girdi",
  "yaptim", "yaptik", "ettim", "edildi",
  "bir", "bu", "su", "o", "da", "de", "ile", "icin",
  "ve", "ama", "sonra", "once", "kadar",
]);

/**
 * Alanlara gitmemiş kelimelerden açıklama üretir.
 *
 * Girdi span'leri ham metindeki karakter aralıklarıdır; bu aralıkların
 * DIŞINDA kalan kelimeler toplanır, dolgu sözcükleri atılır ve geriye
 * anlamlı bir şey kalırsa açıklama olur.
 *
 * Örnek: "dün akşam arkadaşlarla 350 tl yemek yedik"
 *   → tutar, tarih, kategori kendi alanlarına gitti
 *   → açıklama: "akşam arkadaşlarla"
 */
export function buildNote(rawText: string, usedSpans: readonly Span[]): string | null {
  const re = /\S+/g;
  const kept: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(rawText)) !== null) {
    const start = m.index;
    const end = start + m[0].length;

    // Bu kelime kullanılmış bir span ile çakışıyor mu?
    const overlaps = usedSpans.some((s) => start < s.end && end > s.start);
    if (overlaps) continue;

    const bare = m[0].replace(/[^\p{L}\p{N}]/gu, "");
    if (bare === "") continue;

    const normalized = bare
      .replace(/İ/g, "i").replace(/I/g, "i").replace(/ı/g, "i")
      .toLocaleLowerCase("tr")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

    if (FILLER.has(normalized)) continue;
    // Yalnız rakamdan ibaret artık kelime bilgi taşımaz.
    if (/^\d+$/.test(bare)) continue;

    kept.push(m[0]);
  }

  if (kept.length === 0) return null;
  const note = kept.join(" ").trim();
  // Tek kelimelik artık genelde gürültüdür ("bir", "de" gibi dolgu
  // listesinden kaçmış bir ek). İki kelimeden azını not yapma.
  if (note.length < 3) return null;
  // Şema sınırı: note <= 500 karakter.
  return note.slice(0, 500);
}
