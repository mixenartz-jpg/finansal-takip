import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import { isDateStr } from "@/lib/date/date";

/**
 * Bütçe — bir kategorinin bir aydaki harcama limiti.
 *
 * `month` DAİMA ayın 1'idir. Uygulama `startOfMonth()` ile
 * normalleştirir, veritabanı `check (extract(day from month) = 1)`
 * ile garantiler.
 */
export interface Budget {
  id: string;
  categoryId: string;
  month: DateStr;
  limitKurus: Kurus;
}

/**
 * `budget_progress` görünümünden gelen satır: limit + gerçek harcama.
 *
 * Harcama sunucuda toplanır; istemci binlerce işlemi indirip
 * toplamak zorunda kalmaz.
 */
export interface BudgetProgress {
  budgetId: string;
  categoryId: string;
  month: DateStr;
  limitKurus: Kurus;
  spentKurus: Kurus;
  remainingKurus: Kurus;
}

export interface BudgetRow {
  id: string;
  category_id: string;
  month: string;
  limit_kurus: number;
}

export interface BudgetProgressRow {
  budget_id: string;
  category_id: string;
  month: string;
  limit_kurus: number;
  spent_kurus: number;
  remaining_kurus: number;
}

export function toBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    categoryId: row.category_id,
    month: row.month as DateStr,
    limitKurus: row.limit_kurus as Kurus,
  };
}

export function toBudgetProgress(row: BudgetProgressRow): BudgetProgress {
  return {
    budgetId: row.budget_id,
    categoryId: row.category_id,
    month: row.month as DateStr,
    limitKurus: row.limit_kurus as Kurus,
    spentKurus: row.spent_kurus as Kurus,
    remainingKurus: row.remaining_kurus as Kurus,
  };
}

export interface BudgetInput {
  categoryId: string;
  month: DateStr;
  limitKurus: Kurus;
}

export function validateBudget(input: Partial<BudgetInput>): {
  valid: boolean;
  errors: Partial<Record<keyof BudgetInput, string>>;
} {
  const errors: Partial<Record<keyof BudgetInput, string>> = {};

  if (!input.categoryId) {
    errors.categoryId = "Kategori seçin.";
  }

  if (!input.month) {
    errors.month = "Ay seçin.";
  } else if (!isDateStr(input.month)) {
    errors.month = "Geçerli bir ay seçin.";
  } else if (!input.month.endsWith("-01")) {
    // Şemadaki `check (extract(day from month) = 1)` karşılığı.
    // Buraya düşmek bir çağrı noktasının `startOfMonth()` çağırmayı
    // unuttuğu anlamına gelir.
    errors.month = "Ay, ayın ilk günü olmalı.";
  }

  if (input.limitKurus == null) {
    errors.limitKurus = "Limit girin.";
  } else if (input.limitKurus <= 0) {
    errors.limitKurus = "Limit sıfırdan büyük olmalı.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
