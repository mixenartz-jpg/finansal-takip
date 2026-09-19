import type { Kurus } from "@/lib/money/types";

export type AccountKind = "cash" | "bank" | "credit_card";

export const ACCOUNT_NAME_MAX = 60;

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: "Nakit",
  bank: "Banka",
  credit_card: "Kredi Kartı",
};

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  openingKurus: Kurus;
  creditLimitKurus: Kurus | null;
  colorSlot: number;
  sortOrder: number;
  archivedAt: string | null;
}

/** `account_balances` view'ından gelen türetilmiş bakiye. */
export interface AccountBalance {
  accountId: string;
  balanceKurus: Kurus;
}

/** Hesap + güncel bakiyesi — listeleme için birleştirilmiş görünüm. */
export interface AccountWithBalance extends Account {
  balanceKurus: Kurus;
}

export interface AccountRow {
  id: string;
  name: string;
  kind: AccountKind;
  opening_kurus: number;
  credit_limit_kurus: number | null;
  color_slot: number;
  sort_order: number;
  archived_at: string | null;
}

export interface AccountBalanceRow {
  account_id: string;
  balance_kurus: number;
}

export function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    openingKurus: row.opening_kurus as Kurus,
    creditLimitKurus: (row.credit_limit_kurus ?? null) as Kurus | null,
    colorSlot: row.color_slot,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
  };
}

export function toAccountBalance(row: AccountBalanceRow): AccountBalance {
  return {
    accountId: row.account_id,
    balanceKurus: row.balance_kurus as Kurus,
  };
}

export interface AccountInput {
  name: string;
  kind: AccountKind;
  openingKurus: Kurus;
  creditLimitKurus: Kurus | null;
}

export function validateAccount(input: Partial<AccountInput>): {
  valid: boolean;
  errors: Partial<Record<keyof AccountInput, string>>;
} {
  const errors: Partial<Record<keyof AccountInput, string>> = {};

  const name = input.name?.trim() ?? "";
  if (name.length === 0) {
    errors.name = "Hesap adı girin.";
  } else if (name.length > ACCOUNT_NAME_MAX) {
    errors.name = `Hesap adı en fazla ${ACCOUNT_NAME_MAX} karakter olabilir.`;
  }

  if (!input.kind) {
    errors.kind = "Hesap türü seçin.";
  }

  // Kredi limiti YALNIZCA kredi kartında anlamlı — şemadaki
  // `credit_limit_only_on_card` kısıtının istemci karşılığı.
  if (input.creditLimitKurus != null) {
    if (input.kind !== "credit_card") {
      errors.creditLimitKurus = "Kredi limiti yalnızca kredi kartında olur.";
    } else if (input.creditLimitKurus <= 0) {
      errors.creditLimitKurus = "Kredi limiti sıfırdan büyük olmalı.";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
