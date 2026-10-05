import { MAX_BATCH } from "./intent";
import { trLower } from "./resolve";
import { diffDays, isDateStr } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";

/**
 * Hedef kayıt seçimi — güncelleme/silme araçları için.
 *
 * ── NEDEN KİMLİK DEĞİL, TARİF ──
 *
 * Modele hiçbir kimlik gönderilmiyor (gizlilik kararı, bkz.
 * `prompt.ts`). Bir araç kimlik isteseydi model onu UYDURURDU ve
 * `.eq("id", ...)` sıfır satır etkilerdi: kullanıcı "oldu" görür,
 * hiçbir şey olmaz. Daha kötüsü, gerçek bir kimliğe denk gelirse
 * YANLIŞ KAYIT değişir.
 *
 * Bunun yerine model kaydı tarif ediyor ("dünkü market işlemi",
 * "Kira kuralı") ve adaylar burada, istemcinin kendi önbelleğinden
 * bulunuyor. Kullanıcı onay kartında hangisi olduğunu KENDİSİ
 * seçiyor. Kimlik tarayıcıdan hiç çıkmıyor.
 *
 * Bu modül saf: React yok, Supabase yok. Seçici bileşeni
 * (`TargetPicker.tsx`) yalnızca bu fonksiyonları çağırır.
 */

export type TargetKind = "transaction" | "account" | "category" | "rule" | "debt";

export interface TargetSpec {
  kind: TargetKind;
  /** Birden fazla kayıt seçilebilir mi (yalnızca toplu silme). */
  multi: boolean;
  /** Kaydı TARİF eden argümanlar — onay kartında "aranan" diye ayrı gösterilir. */
  matchKeys: readonly string[];
}

const TX_MATCH_KEYS = [
  "matchFrom",
  "matchTo",
  "matchCategoryName",
  "matchNote",
  "matchAmountKurus",
] as const;

const SPECS: Readonly<Record<string, TargetSpec>> = {
  updateTransaction: { kind: "transaction", multi: false, matchKeys: TX_MATCH_KEYS },
  deleteTransaction: { kind: "transaction", multi: true, matchKeys: TX_MATCH_KEYS },
  updateAccount: { kind: "account", multi: false, matchKeys: ["accountName"] },
  updateCategory: { kind: "category", multi: false, matchKeys: ["categoryName"] },
  updateRecurringRule: { kind: "rule", multi: false, matchKeys: ["ruleName"] },
  deleteRecurringRule: { kind: "rule", multi: false, matchKeys: ["ruleName"] },
  updateDebt: { kind: "debt", multi: false, matchKeys: ["debtCounterparty"] },
  addDebtPayment: { kind: "debt", multi: false, matchKeys: ["debtCounterparty"] },
};

/** Araç bir hedef kayıt seçimi gerektiriyor mu? Gerektirmiyorsa null. */
export function targetSpec(toolName: string): TargetSpec | null {
  return SPECS[toolName] ?? null;
}

/**
 * Tek seferde aranabilecek en geniş aralık (gün).
 *
 * Model "geçen ay" yerine "geçen yıl" anlarsa binlerce işlem
 * çekilirdi. Aday listesi zaten MAX_BATCH ile sınırlı; bir yıldan
 * geniş bir tarif neredeyse her zaman yanlış anlamadır.
 */
export const MAX_RANGE_DAYS = 366;

export type RangeResult = { ok: true; from: DateStr; to: DateStr } | { ok: false; error: string };

/** Tarifteki tarih aralığını doğrular. `parseIntent` biçimi zaten denetledi. */
export function transactionRange(args: Record<string, unknown>): RangeResult {
  const from = args.matchFrom;
  const to = args.matchTo;
  if (typeof from !== "string" || typeof to !== "string" || !isDateStr(from) || !isDateStr(to)) {
    return { ok: false, error: "Hangi tarihteki kaydı kastettiğini anlayamadım." };
  }
  if (from > to) {
    return { ok: false, error: "Tarih aralığı ters görünüyor — başlangıç bitişten sonra." };
  }
  if (diffDays(to, from) > MAX_RANGE_DAYS) {
    return { ok: false, error: "Tarih aralığı çok geniş, daraltabilir misin?" };
  }
  return { ok: true, from, to };
}

/** Eşlemenin ihtiyaç duyduğu işlem alanları. */
export interface MatchableTransaction {
  id: string;
  date: string;
  amountKurus: number;
  categoryId: string | null;
  note: string | null;
}

/**
 * Tarife uyan işlemleri bulur.
 *
 * Kategori adı verildiyse ve öyle bir kategori YOKSA sonuç boş
 * döner — filtreyi sessizce düşürmek "dünkü market işlemini sil"
 * isteğini "dünkü TÜM işlemleri sil"e çevirirdi.
 */
export function matchTransactions<T extends MatchableTransaction>(
  txs: readonly T[],
  args: Record<string, unknown>,
  categories: readonly { id: string; name: string }[],
): T[] {
  const range = transactionRange(args);
  if (!range.ok) return [];

  let categoryIds: Set<string> | null = null;
  if (typeof args.matchCategoryName === "string" && args.matchCategoryName.trim()) {
    const needle = trLower(args.matchCategoryName);
    categoryIds = new Set(categories.filter((c) => trLower(c.name) === needle).map((c) => c.id));
    if (categoryIds.size === 0) return [];
  }

  const note =
    typeof args.matchNote === "string" && args.matchNote.trim() ? trLower(args.matchNote) : null;
  const amount = typeof args.matchAmountKurus === "number" ? args.matchAmountKurus : null;

  return txs.filter(
    (t) =>
      t.date >= range.from &&
      t.date <= range.to &&
      (categoryIds === null || (t.categoryId !== null && categoryIds.has(t.categoryId))) &&
      (note === null || (t.note !== null && trLower(t.note).includes(note))) &&
      (amount === null || t.amountKurus === amount),
  );
}

/**
 * Ada göre aday bulur: önce TAM eşleşme, yoksa içeren.
 *
 * Tam eşleşme varsa kısmi eşleşmeler gösterilmez: "Kira" denince
 * "Kira artışı" aday olmamalı. Tam eşleşme yoksa kısmi eşleşmeler
 * kullanıcıya SEÇTİRİLİR — "kart" denince "Kredi kartı" önerilir,
 * ama sessizce seçilmez.
 */
export function matchByName<T>(
  records: readonly T[],
  name: unknown,
  getName: (r: T) => string,
): T[] {
  if (typeof name !== "string" || !name.trim()) return [];
  const needle = trLower(name);
  const exact = records.filter((r) => trLower(getName(r)) === needle);
  if (exact.length > 0) return exact;
  return records.filter((r) => trLower(getName(r)).includes(needle));
}

/**
 * Aday listesinde kullanıcıya söylenmesi gereken bir sorun var mı?
 *
 * @returns Türkçe açıklama, ya da seçime hazırsa null.
 */
export function candidateProblem(count: number): string | null {
  if (count === 0) {
    return "Tarife uyan bir kayıt bulamadım. Biraz farklı anlatır mısın?";
  }
  if (count > MAX_BATCH) {
    return `${count} kayıt eşleşti, bu çok geniş görünüyor — daraltabilir misin?`;
  }
  return null;
}

/**
 * Başlangıç seçimi.
 *
 * Tek aday varsa SEÇİLİ gelir (yine de görünür; kullanıcı onaylar).
 * Birden fazlaysa hiçbiri seçilmez: silmede "hepsi" varsayımı yıkıcı,
 * güncellemede rastgele birini seçmek yanlış kaydı değiştirir.
 */
export function initialSelection(candidates: readonly { id: string }[]): string[] {
  return candidates.length === 1 ? [candidates[0].id] : [];
}

/**
 * Seçimi değiştirir. Tekli modda yeni seçim öncekinin yerine geçer;
 * çoklu modda aç/kapa yapılır ve MAX_BATCH aşılamaz.
 */
export function toggleSelection(
  selected: readonly string[],
  id: string,
  multi: boolean,
): string[] {
  if (!multi) return [id];
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (selected.length >= MAX_BATCH) return [...selected];
  return [...selected, id];
}
