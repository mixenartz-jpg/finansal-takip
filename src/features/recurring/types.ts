import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import { isDateStr } from "@/lib/date/date";

export type RecurFreq = "weekly" | "monthly" | "yearly";

export const RULE_NAME_MAX = 80;
export const RULE_NOTE_MAX = 500;

export const FREQ_LABELS: Record<RecurFreq, string> = {
  weekly: "Haftalık",
  monthly: "Aylık",
  yearly: "Yıllık",
};

/**
 * Tekrarlayan işlem ŞABLONU.
 *
 * Bir işlem DEĞİLDİR: vakti gelince kullanıcı onayıyla bir
 * `Transaction` üretir. Şablonun kendisi hiçbir bakiyeyi etkilemez.
 */
export interface RecurringRule {
  id: string;
  name: string;
  /** Transfer YOK — şema `check (kind <> 'transfer')` ile zorluyor. */
  kind: "income" | "expense";
  amountKurus: Kurus;
  accountId: string;
  categoryId: string | null;
  note: string | null;

  freq: RecurFreq;
  /** weekly → ISO gün (1-7), monthly/yearly → ayın günü (1-31). */
  dayOf: number;
  /** Yalnızca yearly'de dolu (1-12). */
  monthOf: number | null;

  startDate: DateStr;
  endDate: DateStr | null;
  /** Bu kurala göre en son üretilen işlemin tarihi. */
  lastRunDate: DateStr | null;
  /** Duraklatılmışsa ISO zaman damgası. */
  pausedAt: string | null;
}

export interface RecurringRuleRow {
  id: string;
  name: string;
  kind: "income" | "expense";
  amount_kurus: number;
  account_id: string;
  category_id: string | null;
  note: string | null;
  freq: RecurFreq;
  day_of: number;
  month_of: number | null;
  start_date: string;
  end_date: string | null;
  last_run_date: string | null;
  paused_at: string | null;
}

export function toRecurringRule(row: RecurringRuleRow): RecurringRule {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    amountKurus: row.amount_kurus as Kurus,
    accountId: row.account_id,
    categoryId: row.category_id,
    note: row.note,
    freq: row.freq,
    dayOf: row.day_of,
    monthOf: row.month_of,
    startDate: row.start_date as DateStr,
    endDate: (row.end_date ?? null) as DateStr | null,
    lastRunDate: (row.last_run_date ?? null) as DateStr | null,
    pausedAt: row.paused_at,
  };
}

export interface RecurringRuleInput {
  name: string;
  kind: "income" | "expense";
  amountKurus: Kurus;
  accountId: string;
  categoryId: string | null;
  note: string | null;
  freq: RecurFreq;
  dayOf: number;
  monthOf: number | null;
  startDate: DateStr;
  endDate: DateStr | null;
}

export function toRuleRowInput(
  input: RecurringRuleInput,
): Omit<RecurringRuleRow, "id" | "last_run_date" | "paused_at"> {
  return {
    name: input.name.trim(),
    kind: input.kind,
    amount_kurus: input.amountKurus,
    account_id: input.accountId,
    category_id: input.categoryId,
    note: input.note,
    freq: input.freq,
    day_of: input.dayOf,
    month_of: input.monthOf,
    start_date: input.startDate,
    end_date: input.endDate,
  };
}

export function validateRule(input: Partial<RecurringRuleInput>): {
  valid: boolean;
  errors: Partial<Record<keyof RecurringRuleInput, string>>;
} {
  const errors: Partial<Record<keyof RecurringRuleInput, string>> = {};

  const name = input.name?.trim() ?? "";
  if (name.length === 0) {
    errors.name = "Ad girin (örn. Kira, Maaş).";
  } else if (name.length > RULE_NAME_MAX) {
    errors.name = `Ad en fazla ${RULE_NAME_MAX} karakter olabilir.`;
  }

  if (!input.kind) {
    errors.kind = "Gelir mi gider mi seçin.";
  }

  if (input.amountKurus == null) {
    errors.amountKurus = "Tutar girin.";
  } else if (input.amountKurus <= 0) {
    errors.amountKurus = "Tutar sıfırdan büyük olmalı.";
  }

  if (!input.accountId) {
    errors.accountId = "Hesap seçin.";
  }

  if (!input.freq) {
    errors.freq = "Tekrar sıklığı seçin.";
  }

  // Gün aralığı sıklığa BAĞLI: haftalıkta 1-7 (ISO gün), diğerlerinde
  // 1-31 (ayın günü). Şemadaki `weekly_day_in_range` kısıtının
  // istemci karşılığı.
  if (input.dayOf == null) {
    errors.dayOf = "Gün seçin.";
  } else if (input.freq === "weekly") {
    if (input.dayOf < 1 || input.dayOf > 7) {
      errors.dayOf = "Haftanın günü 1-7 arasında olmalı.";
    }
  } else if (input.dayOf < 1 || input.dayOf > 31) {
    errors.dayOf = "Ayın günü 1-31 arasında olmalı.";
  }

  // `month_of` YALNIZCA yearly'de — şemadaki `month_of_only_yearly`.
  if (input.freq === "yearly") {
    if (input.monthOf == null) {
      errors.monthOf = "Ay seçin.";
    } else if (input.monthOf < 1 || input.monthOf > 12) {
      errors.monthOf = "Ay 1-12 arasında olmalı.";
    }
  } else if (input.monthOf != null) {
    errors.monthOf = "Ay yalnızca yıllık tekrarda seçilir.";
  }

  if (!input.startDate) {
    errors.startDate = "Başlangıç tarihi seçin.";
  } else if (!isDateStr(input.startDate)) {
    errors.startDate = "Geçerli bir başlangıç tarihi seçin.";
  }

  if (input.endDate) {
    if (!isDateStr(input.endDate)) {
      errors.endDate = "Geçerli bir bitiş tarihi seçin.";
    } else if (input.startDate && input.endDate < input.startDate) {
      errors.endDate = "Bitiş tarihi başlangıçtan önce olamaz.";
    }
  }

  if (input.note && input.note.length > RULE_NOTE_MAX) {
    errors.note = `Açıklama en fazla ${RULE_NOTE_MAX} karakter olabilir.`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
