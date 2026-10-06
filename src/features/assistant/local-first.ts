import { CONFIDENCE_THRESHOLD, type ParseResult } from "@/features/parser/types";
import type { Intent } from "./intent";
import type { NamedRecord } from "./resolve";

/**
 * Kural motoru sonucunu niyete çevirir — ya da devreder.
 *
 * ── NEDEN ÖNCE KURAL MOTORU ──
 *
 * Kural motoru ÜCRETSİZ, ANLIK ve ÇEVRİMDIŞI. "200 tl yemek aldım"
 * gibi cümlelerde Gemini'ye gitmek hem günlük kotadan yer yer hem
 * kullanıcıyı ağ gecikmesi kadar bekletir. `ChainedParser` bunu
 * dikte yolunda zaten yapıyordu; burada sohbet yoluna taşınıyor.
 *
 * ── NE ZAMAN DEVREDER ──
 *
 * `null` dönerse çağıran taraf `/api/chat`'e gider. Devretme
 * sebepleri: güven eşiğin altında, zorunlu alan eksik, soru
 * cümlesi (taslak boş), ya da şema kısıtını ihlal eden taslak.
 *
 * Emin olmadığı tahmini onay kartına koymak, kullanıcıyı yanlış
 * veriyi onaylamaya davet etmek olurdu.
 */

/** Sayı: "300", "12,50", "1.250,50" tek sayı sayılır. */
const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

/**
 * Cümlede birden fazla sayı var mı?
 *
 * ── NEDEN ──
 *
 * Kural motoru cümle başına TEK işlem çıkarır. "markete 300 benzine
 * 500 verdim" cümlesinde ilk tutarı alıp yüksek güvenle döner; ikinci
 * harcama sessizce kaybolur. Birden fazla sayı geçen cümle bu yüzden
 * doğrudan Gemini'ye devredilir.
 *
 * Yanlış alarm ("5 ekimde 300 lira") zararsız: yalnızca kural motoru
 * yerine Gemini cevap verir.
 */
export function mentionsMultipleAmounts(text: string): boolean {
  return (text.match(NUMBER_RE)?.length ?? 0) > 1;
}

export interface LocalContext {
  categories: readonly NamedRecord[];
  accounts: readonly NamedRecord[];
  defaultAccountId: string | null;
}

/** Kimliği ada çevirir; kayıt bulunamazsa null. */
function nameOf(id: string | null, records: readonly NamedRecord[]): string | null {
  if (!id) return null;
  return records.find((r) => r.id === id)?.name ?? null;
}

export function draftToIntent(result: ParseResult, ctx: LocalContext): Intent | null {
  if (result.overall < CONFIDENCE_THRESHOLD) return null;

  const { draft } = result;

  // Zorunlu üçlü: tür, tutar, tarih. Biri eksikse kural motoru
  // cümleyi çözememiş demektir.
  if (!draft.kind || draft.amountKurus === null || !draft.date) return null;

  const args: Record<string, unknown> = {
    kind: draft.kind,
    amountKurus: draft.amountKurus,
    date: draft.date,
  };

  // ── Hesap ──
  const accountId = draft.accountId ?? ctx.defaultAccountId;
  const accountName = nameOf(accountId, ctx.accounts);
  if (!accountName) return null;
  args.accountName = accountName;

  // ── Transfer ──
  if (draft.kind === "transfer") {
    // Şemada karşı hesap zorunlu (`transfer_shape`). Eksikse
    // devret: Gemini sorabilir.
    const counterName = nameOf(draft.counterAccountId, ctx.accounts);
    if (!counterName) return null;
    args.counterAccountName = counterName;
  } else if (draft.categoryId) {
    // Kategori kimliği listede yoksa (kategori silinmiş olabilir)
    // ada çevrilemez; tahmini zorlamak yerine devret.
    const categoryName = nameOf(draft.categoryId, ctx.categories);
    if (!categoryName) return null;
    args.categoryName = categoryName;
  }

  if (draft.note) args.note = draft.note;

  // `needsConfirm: true` — kural motorundan gelse bile onay kartı
  // zorunlu. Parser bir TAHMİN üretir, kayıt değil.
  return { name: "createTransaction", args, needsConfirm: true };
}
