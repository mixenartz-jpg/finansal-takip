import { resolveName, type NamedRecord } from "./resolve";
import type { TransactionInput } from "@/features/transactions/types";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";

/**
 * Niyet → `TransactionInput` çevirisi.
 *
 * ── TEK YAZMA KAPISI KORUNUYOR ──
 *
 * Bu modül veritabanına DOKUNMAZ. Yalnızca asistanın ürettiği
 * niyeti, formların da kullandığı `TransactionInput` şekline
 * çevirir; kaydı `useCreateTransaction` yapar. Böylece doğrulama,
 * hata çevirisi ve önbellek geçersiz kılma tek yerde kalır.
 *
 * ── ŞEMA KISITLARI BURADA DA UYGULANIR ──
 *
 * Transferde kategori olamaz (`transfer_shape` kısıtı) ve kaynak
 * ile hedef hesap aynı olamaz. Model bunları ihlal eden bir niyet
 * üretebilir; geçirilirse kullanıcı ham Postgres kısıt hatası
 * görür. Burada yakalamak anlaşılır bir cümle üretiyor.
 */

export interface ResolveContext {
  categories: readonly NamedRecord[];
  accounts: readonly NamedRecord[];
  /** Cümlede hesap geçmezse kullanılacak hesap. */
  defaultAccountId: string | null;
}

export type ToInputResult =
  | { ok: true; input: TransactionInput }
  | { ok: false; error: string };

/**
 * Asistan işlemlerinin kaynağı.
 *
 * `source` sütununun check kısıtı yalnızca
 * manual/voice/recurring/import kabul ediyor (0001_schema.sql).
 * Ayrı bir 'assistant' türü eklemek migration gerektirirdi;
 * asistan girdisi de sonuçta konuşma/yazı yoluyla geldiği için
 * 'voice' altında toplanıyor.
 */
const ASSISTANT_SOURCE = "voice" as const;

export function intentToTransactionInput(
  args: Record<string, unknown>,
  ctx: ResolveContext,
): ToInputResult {
  const kind = args.kind as TransactionInput["kind"];

  // ── Hesap ──
  let accountId: string;
  if (typeof args.accountName === "string") {
    const r = resolveName(args.accountName, ctx.accounts);
    if (!r.ok) return { ok: false, error: r.error };
    accountId = r.id;
  } else if (ctx.defaultAccountId) {
    accountId = ctx.defaultAccountId;
  } else {
    return {
      ok: false,
      error: "Hangi hesabı kullanacağımı bilmiyorum. Önce bir hesap ekle.",
    };
  }

  // ── Karşı hesap (yalnızca transfer) ──
  let counterAccountId: string | null = null;
  if (kind === "transfer") {
    if (typeof args.counterAccountName !== "string") {
      return { ok: false, error: "Transfer için hedef hesap gerekli." };
    }
    const r = resolveName(args.counterAccountName, ctx.accounts);
    if (!r.ok) return { ok: false, error: r.error };
    if (r.id === accountId) {
      return { ok: false, error: "Kaynak ve hedef aynı hesap olamaz." };
    }
    counterAccountId = r.id;
  }

  // ── Kategori ──
  // Transferde kategori ŞEMADA yasak: model verse bile atılır.
  let categoryId: string | null = null;
  if (kind !== "transfer" && typeof args.categoryName === "string") {
    const r = resolveName(args.categoryName, ctx.categories);
    if (!r.ok) return { ok: false, error: r.error };
    categoryId = r.id;
  }

  return {
    ok: true,
    input: {
      kind,
      amountKurus: args.amountKurus as Kurus,
      date: args.date as DateStr,
      accountId,
      counterAccountId,
      categoryId,
      // `undefined` DEĞİL `null`: sütun nullable ve supabase-js
      // `undefined` alanı gövdeden tamamen atar. Güncellemede bu
      // "dokunma" anlamına gelir, eklemede ise varsayılan devreye
      // girer — ikisi de sessizce farklı davranır.
      note: typeof args.note === "string" && args.note.trim() ? args.note.trim() : null,
      // Dikte değil: ham transkript yok. Sohbet metnini buraya
      // yazmak yanıltıcı olurdu — kullanıcı cümleyi yazmış olabilir.
      voiceTranscript: null,
      source: ASSISTANT_SOURCE,
    },
  };
}
