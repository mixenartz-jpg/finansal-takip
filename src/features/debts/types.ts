import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import { isDateStr } from "@/lib/date/date";

/**
 * `payable`    — BEN borçluyum (kime borcum var)
 * `receivable` — BANA borçlular (kim bana borçlu)
 */
export type DebtDirection = "payable" | "receivable";

export const COUNTERPARTY_MAX = 80;
export const DEBT_NOTE_MAX = 500;
export const PAYMENT_NOTE_MAX = 300;

export const DIRECTION_LABELS: Record<DebtDirection, string> = {
  payable: "Borcum",
  receivable: "Alacağım",
};

export interface Debt {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  principalKurus: Kurus;
  openedOn: DateStr;
  dueOn: DateStr | null;
  note: string | null;
}

/**
 * `debt_balances` görünümünden gelen satır: borç + ödeme özeti.
 *
 * `closed` diye bir alan YOK — kapanma `remainingKurus <= 0` ile
 * türetilir. Ayrı bir bayrak, bir ödeme silinince yalan söylerdi.
 */
export interface DebtBalance extends Debt {
  debtId: string;
  paidKurus: Kurus;
  remainingKurus: Kurus;
  paymentCount: number;
  lastPaymentDate: DateStr | null;
}

export interface DebtPayment {
  id: string;
  debtId: string;
  amountKurus: Kurus;
  date: DateStr;
  note: string | null;
  /** Bu ödeme bir para hareketi de yarattıysa o işlem. */
  transactionId: string | null;
}

export interface DebtRow {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  principal_kurus: number;
  opened_on: string;
  due_on: string | null;
  note: string | null;
}

export interface DebtBalanceRow {
  debt_id: string;
  direction: DebtDirection;
  principal_kurus: number;
  paid_kurus: number;
  remaining_kurus: number;
  payment_count: number;
  last_payment_date: string | null;
}

export interface DebtPaymentRow {
  id: string;
  debt_id: string;
  amount_kurus: number;
  date: string;
  note: string | null;
  transaction_id: string | null;
}

export function toDebt(row: DebtRow): Debt {
  return {
    id: row.id,
    direction: row.direction,
    counterparty: row.counterparty,
    principalKurus: row.principal_kurus as Kurus,
    openedOn: row.opened_on as DateStr,
    dueOn: (row.due_on ?? null) as DateStr | null,
    note: row.note,
  };
}

export function toDebtPayment(row: DebtPaymentRow): DebtPayment {
  return {
    id: row.id,
    debtId: row.debt_id,
    amountKurus: row.amount_kurus as Kurus,
    date: row.date as DateStr,
    note: row.note,
    transactionId: row.transaction_id,
  };
}

export interface DebtInput {
  direction: DebtDirection;
  counterparty: string;
  principalKurus: Kurus;
  openedOn: DateStr;
  dueOn: DateStr | null;
  note: string | null;
}

export function toDebtRowInput(input: DebtInput): Omit<DebtRow, "id"> {
  return {
    direction: input.direction,
    counterparty: input.counterparty.trim(),
    principal_kurus: input.principalKurus,
    opened_on: input.openedOn,
    due_on: input.dueOn,
    note: input.note,
  };
}

export function validateDebt(input: Partial<DebtInput>): {
  valid: boolean;
  errors: Partial<Record<keyof DebtInput, string>>;
} {
  const errors: Partial<Record<keyof DebtInput, string>> = {};

  if (!input.direction) {
    errors.direction = "Borç mu alacak mı seçin.";
  }

  const name = input.counterparty?.trim() ?? "";
  if (name.length === 0) {
    errors.counterparty = "Kişi veya kurum adı girin.";
  } else if (name.length > COUNTERPARTY_MAX) {
    errors.counterparty = `Ad en fazla ${COUNTERPARTY_MAX} karakter olabilir.`;
  }

  if (input.principalKurus == null) {
    errors.principalKurus = "Tutar girin.";
  } else if (input.principalKurus <= 0) {
    errors.principalKurus = "Tutar sıfırdan büyük olmalı.";
  }

  if (!input.openedOn) {
    errors.openedOn = "Tarih seçin.";
  } else if (!isDateStr(input.openedOn)) {
    errors.openedOn = "Geçerli bir tarih seçin.";
  }

  if (input.dueOn) {
    if (!isDateStr(input.dueOn)) {
      errors.dueOn = "Geçerli bir son ödeme tarihi seçin.";
    } else if (input.openedOn && input.dueOn < input.openedOn) {
      // Şemadaki `due_after_opened` kısıtının istemci karşılığı.
      errors.dueOn = "Son ödeme tarihi, borcun alındığı tarihten önce olamaz.";
    }
  }

  if (input.note && input.note.length > DEBT_NOTE_MAX) {
    errors.note = `Açıklama en fazla ${DEBT_NOTE_MAX} karakter olabilir.`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export interface PaymentInput {
  debtId: string;
  amountKurus: Kurus;
  date: DateStr;
  note: string | null;
  /**
   * İşaretliyse ödeme aynı zamanda bir para hareketi yaratır:
   * borç ödemesi gider, alacak tahsilatı gelir olarak kaydedilir.
   * İşaretsizse yalnızca borç defteri güncellenir ("elden verdim").
   */
  createTransaction: boolean;
  /** İşlem oluşturulacaksa hangi hesaptan. */
  accountId: string | null;
}

export function validatePayment(
  input: Partial<PaymentInput>,
  context?: { openedOn?: DateStr; remainingKurus?: Kurus },
): {
  valid: boolean;
  errors: Partial<Record<keyof PaymentInput, string>>;
  /** Engellemez ama kullanıcıya gösterilir. */
  warnings: string[];
} {
  const errors: Partial<Record<keyof PaymentInput, string>> = {};
  const warnings: string[] = [];

  if (input.amountKurus == null) {
    errors.amountKurus = "Tutar girin.";
  } else if (input.amountKurus <= 0) {
    errors.amountKurus = "Tutar sıfırdan büyük olmalı.";
  } else if (
    context?.remainingKurus != null &&
    input.amountKurus > context.remainingKurus
  ) {
    // ENGELLEMEZ: kullanıcı faizli bir borcu fazla ödemiş olabilir
    // ya da anaparayı yanlış girmiştir. Uyarır, karar kullanıcının.
    warnings.push("Bu ödeme kalan borçtan fazla.");
  }

  if (!input.date) {
    errors.date = "Tarih seçin.";
  } else if (!isDateStr(input.date)) {
    errors.date = "Geçerli bir tarih seçin.";
  } else if (context?.openedOn && input.date < context.openedOn) {
    // Şemadaki `check_payment_date` trigger'ının istemci karşılığı.
    errors.date = "Ödeme tarihi, borcun alındığı tarihten önce olamaz.";
  }

  // İşlem oluşturulacaksa hesap zorunlu — aksi halde para hangi
  // hesaptan çıktı belli olmaz.
  if (input.createTransaction && !input.accountId) {
    errors.accountId = "Hesap seçin.";
  }

  if (input.note && input.note.length > PAYMENT_NOTE_MAX) {
    errors.note = `Açıklama en fazla ${PAYMENT_NOTE_MAX} karakter olabilir.`;
  }

  return { valid: Object.keys(errors).length === 0, errors, warnings };
}
