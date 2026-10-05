import { resolveName, type NamedRecord } from "./resolve";
import type { AccountInput } from "@/features/accounts/types";
import type { CategoryInput } from "@/features/categories/types";
import type { BudgetInput } from "@/features/budgets/types";
import type { DebtInput } from "@/features/debts/types";
import type { RecurringRuleInput } from "@/features/recurring/types";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";

/**
 * Niyet → mutation girdisi çevirileri (yazma araçları).
 *
 * ── NEDEN BU KATMAN VAR ──
 *
 * Araç şemasındaki ad ile hook'un beklediği alan adı AYNI DEĞİL ve
 * olması da gerekmiyor: şema modele okunur gelmeli, hook ise
 * veritabanı şekline yakın durmalı. Örnekler:
 *
 *   createDebt.amountKurus   → DebtInput.principalKurus
 *   (şemada yok)             → DebtInput.openedOn (bugün)
 *   setBudget.month 'YYYY-MM'→ BudgetInput.month 'YYYY-MM-01'
 *
 * Bu farkları tek yerde tutmak, her çağrı noktasında yeniden
 * hatırlamaktan iyi — ve testlerle kilitlenebiliyor.
 *
 * ── ŞEMA KISITLARI BURADA DA UYGULANIR ──
 *
 * `intent.ts` araç şemasına uyumu doğruluyor ama tablolar arası
 * kuralları bilmiyor: bütçe yalnızca gider kategorisine konabilir,
 * limit yalnızca kredi kartında olabilir, haftalık kuralda gün
 * 1-7 arasında olmalı. Burada yakalanmazsa kullanıcı ham Postgres
 * kısıt hatası görür.
 */

export type WriteResult<T> = { ok: true; input: T } | { ok: false; error: string };

const fail = <T>(error: string): WriteResult<T> => ({ ok: false, error });

/** `kind` alanı taşıyan kategori kaydı — bütçe kontrolü için. */
interface KindedRecord extends NamedRecord {
  kind?: "income" | "expense";
}

// ───────────────────────────── Hesap ─────────────────────────────

export function intentToAccountInput(
  args: Record<string, unknown>,
): WriteResult<AccountInput> {
  const kind = args.kind as AccountInput["kind"];
  const creditLimitKurus =
    typeof args.creditLimitKurus === "number" ? (args.creditLimitKurus as Kurus) : null;

  // Şemada `credit_limit_only_on_card` kısıtı var.
  if (creditLimitKurus !== null && kind !== "credit_card") {
    return fail("Kredi limiti yalnızca kredi kartı hesabında olur.");
  }

  return {
    ok: true,
    input: {
      name: String(args.name).trim(),
      kind,
      // Negatif OLABİLİR: kredi kartında açılış bakiyesi borçtur.
      openingKurus: (typeof args.openingKurus === "number" ? args.openingKurus : 0) as Kurus,
      creditLimitKurus,
    },
  };
}

// ──────────────────────────── Kategori ────────────────────────────

export function intentToCategoryInput(
  args: Record<string, unknown>,
): WriteResult<CategoryInput> {
  return {
    ok: true,
    input: {
      name: String(args.name).trim(),
      kind: args.kind as CategoryInput["kind"],
      keywords: Array.isArray(args.keywords) ? (args.keywords as string[]) : [],
    },
  };
}

// ───────────────────────────── Bütçe ─────────────────────────────

/** 'YYYY-MM' ya da boş → 'YYYY-MM-01'. Şema ayın 1'ini zorunlu kılar. */
function monthStart(month: unknown, today: string): DateStr {
  const raw = typeof month === "string" && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  return `${raw}-01` as DateStr;
}

export function intentToBudgetInput(
  args: Record<string, unknown>,
  categories: readonly KindedRecord[],
  today: string,
): WriteResult<BudgetInput> {
  const r = resolveName(String(args.categoryName ?? ""), categories);
  if (!r.ok) return fail(r.error);

  // Bütçe yalnızca GİDER kategorisine konabilir
  // (`check_budget_category_kind`, 0006). Kategori listesinde tür
  // bilgisi varsa burada yakalanıyor.
  const cat = categories.find((c) => c.id === r.id);
  if (cat?.kind === "income") {
    return fail("Bütçe yalnızca gider kategorisine konabilir.");
  }

  return {
    ok: true,
    input: {
      categoryId: r.id,
      month: monthStart(args.month, today),
      limitKurus: args.limitKurus as Kurus,
    },
  };
}

// ────────────────────────────── Borç ──────────────────────────────

export function intentToDebtInput(
  args: Record<string, unknown>,
  today: string,
): WriteResult<DebtInput> {
  const openedOn = today as DateStr;
  const dueOn = typeof args.dueDate === "string" ? (args.dueDate as DateStr) : null;

  // Vade açılıştan önce olamaz: borç doğduğu anda kapanmış sayılırdı.
  if (dueOn && dueOn < openedOn) {
    return fail("Vade tarihi bugünden önce olamaz.");
  }

  return {
    ok: true,
    input: {
      direction: args.direction as DebtInput["direction"],
      counterparty: String(args.counterparty).trim(),
      // Araç `amountKurus` diyor, hook `principalKurus` istiyor.
      principalKurus: args.amountKurus as Kurus,
      openedOn,
      dueOn,
      note: typeof args.note === "string" && args.note.trim() ? args.note.trim() : null,
    },
  };
}

// ───────────────────────── Düzenli ödeme ─────────────────────────

export interface RecurringContext {
  categories: readonly NamedRecord[];
  accounts: readonly NamedRecord[];
}

export function intentToRecurringInput(
  args: Record<string, unknown>,
  ctx: RecurringContext,
  today: string,
): WriteResult<RecurringRuleInput> {
  const acc = resolveName(String(args.accountName ?? ""), ctx.accounts);
  if (!acc.ok) return fail(acc.error);

  let categoryId: string | null = null;
  if (typeof args.categoryName === "string") {
    const cat = resolveName(args.categoryName, ctx.categories);
    if (!cat.ok) return fail(cat.error);
    categoryId = cat.id;
  }

  const freq = args.freq as RecurringRuleInput["freq"];
  const dayOf = args.dayOf as number;

  /*
   * ── HAFTALIK KURALDA GÜN 1-7 ──
   *
   * `dayOf` haftalıkta ISO hafta günü. `intent.ts` 1-31 aralığını
   * doğruluyor (aylık kural için doğru), bu yüzden haftalıkta 12
   * gibi bir değer oradan GEÇER. Yakalanmazsa kural hiç
   * tetiklenmeyen bir güne kurulur ve kullanıcı sebebini hiç
   * anlamaz — sessiz bir "çalışmıyor".
   */
  if (freq === "weekly" && (dayOf < 1 || dayOf > 7)) {
    return fail("Haftalık kuralda gün 1 (Pazartesi) ile 7 (Pazar) arasında olmalı.");
  }

  // Yıllıkta ay zorunlu: hangi ay olduğu belirsiz kalamaz.
  const monthOf = typeof args.monthOf === "number" ? args.monthOf : null;
  if (freq === "yearly" && monthOf === null) {
    return fail("Yıllık kural için hangi ay olduğunu söylemen gerekiyor.");
  }

  return {
    ok: true,
    input: {
      name: String(args.name).trim(),
      kind: args.kind as RecurringRuleInput["kind"],
      amountKurus: args.amountKurus as Kurus,
      accountId: acc.id,
      categoryId,
      note: typeof args.note === "string" && args.note.trim() ? args.note.trim() : null,
      freq,
      dayOf,
      monthOf,
      startDate: today as DateStr,
      endDate: null,
    },
  };
}

/**
 * Hedef kaydın kimliğini ADDAN çözer.
 *
 * ── NEDEN `args.id` KULLANILMIYOR ──
 *
 * Modele hiçbir kimlik gönderilmiyor: sistem yönergesi yalnızca
 * ad listeliyor (`prompt.ts`) ve okuma araçlarının çıktısında da
 * kimlik yok (`read-tools.ts`). Dolayısıyla modelin ürettiği `id`
 * alanı ancak UYDURMA olabilir.
 *
 * Uydurma kimlikle `.eq("id", ...)` çağırmak sıfır satır etkiler
 * — Supabase bunu hata saymaz — ve kullanıcı "oldu" sanır ama
 * hiçbir şey olmaz. Sessiz başarısızlık, açık hatadan kötüdür.
 *
 * (RLS gerçek bir yabancı kimlikte de koruyor; buradaki sorun
 * güvenlik değil, aracın HİÇ çalışmaması.)
 */
export function resolveTargetId(
  args: Record<string, unknown>,
  nameKey: string,
  records: readonly NamedRecord[],
): { ok: true; id: string } | { ok: false; error: string } {
  const raw = args[nameKey];
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Hangisini kastettiğini anlayamadım, adını söyler misin?" };
  }
  const r = resolveName(raw, records);
  return r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error };
}
