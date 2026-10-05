import { resolveName, type NamedRecord } from "./resolve";
import type { WriteResult } from "./to-write";
import {
  validateTransactionPatch,
  type Transaction,
  type TransactionPatch,
} from "@/features/transactions/types";
import { validateAccount, type Account, type AccountInput } from "@/features/accounts/types";
import {
  validateCategory,
  type Category,
  type CategoryPatch,
} from "@/features/categories/types";
import {
  validateDebt,
  validatePayment,
  type Debt,
  type DebtInput,
  type PaymentInput,
} from "@/features/debts/types";
import {
  validateRule,
  type RecurringRule,
  type RecurringRuleInput,
} from "@/features/recurring/types";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";

/**
 * Niyet + SEÇİLEN KAYIT → güncelleme girdisi.
 *
 * ── NEDEN MEVCUT KAYIT GEREKİYOR ──
 *
 * Güncelleme hook'ları kaydın TAMAMINI istiyor (`useUpdateAccount`
 * tüm `AccountInput`'u yazar). Model ise yalnızca değişecek alanı
 * söylüyor ("adını Maaş Hesabı yap"). Verilmeyen alanlar mevcut
 * kayıttan doldurulmazsa güncelleme, kullanıcının dokunmadığı
 * alanları boşaltırdı.
 *
 * Mevcut kayıt kullanıcının onay kartında SEÇTİĞİ kayıttır; model
 * onu hiç görmedi.
 *
 * ── HİÇBİR ŞEY DEĞİŞMİYORSA HATA ──
 *
 * "Kira kuralını güncelle" deyip yeni değer vermemek bir hata
 * değil ama bir işlem de değil. Aynı veriyi yazmak "oldu" mesajı
 * üretir ve kullanıcı bir şeyin değiştiğini sanar.
 */

const NOTHING = "Neyi değiştireceğini anlayamadım. Yeni değeri söyler misin?";

const fail = <T>(error: string): WriteResult<T> => ({ ok: false, error });

/** Doğrulayıcının ilk hatası — onay kartında tek cümle gösterilir. */
function firstError(errors: Record<string, string | undefined>): string {
  return Object.values(errors).find(Boolean) ?? "Bu değişiklik geçerli değil.";
}

const has = (args: Record<string, unknown>, key: string) => args[key] !== undefined;

// ───────────────────────────── İşlem ─────────────────────────────

const TX_FIELDS = [
  "kind",
  "amountKurus",
  "date",
  "accountName",
  "counterAccountName",
  "categoryName",
  "note",
] as const;

interface KindedCategory extends NamedRecord {
  kind: "income" | "expense";
}

export function intentToTransactionPatch(
  args: Record<string, unknown>,
  existing: Transaction,
  ctx: { categories: readonly KindedCategory[]; accounts: readonly NamedRecord[] },
): WriteResult<TransactionPatch> {
  if (!TX_FIELDS.some((k) => has(args, k))) return fail(NOTHING);

  const kind = (args.kind as TransactionPatch["kind"] | undefined) ?? existing.kind;

  let accountId = existing.accountId;
  if (typeof args.accountName === "string") {
    const r = resolveName(args.accountName, ctx.accounts);
    if (!r.ok) return fail(r.error);
    accountId = r.id;
  }

  /*
   * ── TÜR DEĞİŞİMİ ŞEKLİ DE DEĞİŞTİRİR ──
   *
   * Transferde kategori olmaz, hedef hesap olur (`transfer_shape`).
   * Gider → transfer geçişinde eski kategori taşınırsa kısıt
   * ihlali; transfer → gider geçişinde eski hedef hesap taşınırsa
   * aynı şekilde. Bu yüzden tür, diğer iki alanı belirliyor.
   */
  let counterAccountId: string | null = null;
  let categoryId: string | null = null;

  if (kind === "transfer") {
    counterAccountId = existing.kind === "transfer" ? existing.counterAccountId : null;
    if (typeof args.counterAccountName === "string") {
      const r = resolveName(args.counterAccountName, ctx.accounts);
      if (!r.ok) return fail(r.error);
      counterAccountId = r.id;
    }
  } else {
    // Tür değişmediyse eski kategori kalır; değiştiyse eski kategori
    // (gider kategorisi gelirde) anlamsızdır, yenisi verilmeli.
    categoryId = existing.kind === kind ? existing.categoryId : null;
    if (typeof args.categoryName === "string") {
      const r = resolveName(args.categoryName, ctx.categories);
      if (!r.ok) return fail(r.error);
      categoryId = r.id;
    }
    const cat = categoryId ? ctx.categories.find((c) => c.id === categoryId) : undefined;
    if (cat && cat.kind !== kind) {
      return fail(
        `"${cat.name}" bir ${cat.kind === "income" ? "gelir" : "gider"} kategorisi, bu işleme uymuyor.`,
      );
    }
  }

  const patch: TransactionPatch = {
    kind,
    amountKurus: (args.amountKurus as Kurus | undefined) ?? existing.amountKurus,
    date: (args.date as DateStr | undefined) ?? existing.date,
    accountId,
    counterAccountId,
    categoryId,
    note:
      typeof args.note === "string" ? args.note.trim() || null : existing.note,
  };

  const v = validateTransactionPatch(patch);
  return v.valid ? { ok: true, input: patch } : fail(firstError(v.errors));
}

// ───────────────────────────── Hesap ─────────────────────────────

export function intentToAccountUpdate(
  args: Record<string, unknown>,
  existing: Account,
): WriteResult<AccountInput> {
  if (!has(args, "name") && !has(args, "creditLimitKurus")) return fail(NOTHING);

  const input: AccountInput = {
    name: typeof args.name === "string" ? args.name.trim() : existing.name,
    kind: existing.kind,
    openingKurus: existing.openingKurus,
    creditLimitKurus:
      typeof args.creditLimitKurus === "number"
        ? (args.creditLimitKurus as Kurus)
        : existing.creditLimitKurus,
  };

  const v = validateAccount(input);
  return v.valid ? { ok: true, input } : fail(firstError(v.errors));
}

// ──────────────────────────── Kategori ────────────────────────────

export function intentToCategoryPatch(
  args: Record<string, unknown>,
  existing: Category,
): WriteResult<CategoryPatch> {
  if (!has(args, "name") && !has(args, "keywords")) return fail(NOTHING);

  // TÜR bilerek dışarıda: kategoriye bağlı kayıt varsa değiştirilemez
  // (0010) ve araç şeması da onu sunmuyor.
  const patch: CategoryPatch = {
    name: typeof args.name === "string" ? args.name.trim() : existing.name,
    kind: existing.kind,
    keywords: Array.isArray(args.keywords) ? (args.keywords as string[]) : existing.keywords,
  };

  const v = validateCategory(patch);
  return v.valid ? { ok: true, input: patch } : fail(firstError(v.errors));
}

// ───────────────────────── Düzenli ödeme ─────────────────────────

export function intentToRuleUpdate(
  args: Record<string, unknown>,
  existing: RecurringRule,
): WriteResult<RecurringRuleInput> {
  if (!has(args, "name") && !has(args, "amountKurus") && !has(args, "dayOf")) {
    return fail(NOTHING);
  }

  const dayOf = typeof args.dayOf === "number" ? args.dayOf : existing.dayOf;
  // Haftalıkta gün ISO hafta günü; `parseIntent` yalnızca 1-31'i
  // denetliyor (bkz. `intentToRecurringInput`).
  if (existing.freq === "weekly" && (dayOf < 1 || dayOf > 7)) {
    return fail("Haftalık kuralda gün 1 (Pazartesi) ile 7 (Pazar) arasında olmalı.");
  }

  const input: RecurringRuleInput = {
    name: typeof args.name === "string" ? args.name.trim() : existing.name,
    kind: existing.kind,
    amountKurus: (args.amountKurus as Kurus | undefined) ?? existing.amountKurus,
    accountId: existing.accountId,
    categoryId: existing.categoryId,
    note: existing.note,
    freq: existing.freq,
    dayOf,
    monthOf: existing.monthOf,
    startDate: existing.startDate,
    endDate: existing.endDate,
  };

  const v = validateRule(input);
  return v.valid ? { ok: true, input } : fail(firstError(v.errors));
}

// ────────────────────────────── Borç ──────────────────────────────

export function intentToDebtUpdate(
  args: Record<string, unknown>,
  existing: Debt,
): WriteResult<DebtInput> {
  if (!has(args, "counterparty") && !has(args, "amountKurus") && !has(args, "dueDate")) {
    return fail(NOTHING);
  }

  const input: DebtInput = {
    direction: existing.direction,
    counterparty:
      typeof args.counterparty === "string" ? args.counterparty.trim() : existing.counterparty,
    // Araç `amountKurus` diyor, hook `principalKurus` istiyor.
    principalKurus: (args.amountKurus as Kurus | undefined) ?? existing.principalKurus,
    openedOn: existing.openedOn,
    dueOn: (args.dueDate as DateStr | undefined) ?? existing.dueOn,
    note: existing.note,
  };

  const v = validateDebt(input);
  return v.valid ? { ok: true, input } : fail(firstError(v.errors));
}

/**
 * Borç ödemesi.
 *
 * ── HESAP VERİLMEDİYSE BAKİYE DEĞİŞMEZ ──
 *
 * Ödeme formu varsayılan olarak ilk hesaptan işlem de yaratıyor.
 * Asistanda bu varsayım GİZLİ kalırdı: onay kartında hesap satırı
 * görünmez ama bakiye değişir. Bu yüzden işlem yalnızca kullanıcı
 * hesabı söylediyse (ve kartta gördüyse) yaratılıyor.
 */
export function intentToPaymentInput(
  args: Record<string, unknown>,
  debt: Debt,
  accounts: readonly NamedRecord[],
  today: string,
): WriteResult<PaymentInput> {
  let accountId: string | null = null;
  if (typeof args.accountName === "string") {
    const r = resolveName(args.accountName, accounts);
    if (!r.ok) return fail(r.error);
    accountId = r.id;
  }

  const input: PaymentInput = {
    debtId: debt.id,
    amountKurus: args.amountKurus as Kurus,
    date: ((args.date as string | undefined) ?? today) as DateStr,
    note: null,
    createTransaction: accountId !== null,
    accountId,
  };

  const v = validatePayment(input, { openedOn: debt.openedOn });
  return v.valid ? { ok: true, input } : fail(firstError(v.errors));
}
