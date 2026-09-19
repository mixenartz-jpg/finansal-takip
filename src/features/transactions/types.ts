import type { DateStr } from "@/lib/date/types";
import type { Kurus } from "@/lib/money/types";

export type TransactionKind = "income" | "expense" | "transfer";
export type TransactionSource = "manual" | "voice" | "recurring" | "import";

/** Şema kısıtlarının TS karşılıkları — form doğrulaması bunları kullanır. */
export const NOTE_MAX = 500;
export const TRANSCRIPT_MAX = 1000;

/**
 * Uygulama içi işlem modeli.
 *
 * Veritabanı satırından (`TransactionRow`) AYRI tutulur: satır
 * snake_case ve ham tiplerle gelir, model camelCase ve markalı
 * tiplerle çalışır. Dönüşüm tek yerde (`toTransaction`) olur ve
 * markalı tipler o sınırdan sonra garanti edilir.
 */
export interface Transaction {
  id: string;
  kind: TransactionKind;
  amountKurus: Kurus;
  date: DateStr;
  accountId: string;
  counterAccountId: string | null;
  categoryId: string | null;
  note: string | null;
  voiceTranscript: string | null;
  source: TransactionSource;
  createdAt: string;
}

/** Yeni işlem girdisi. `user_id` GÖNDERİLMEZ — trigger damgalar. */
export interface TransactionInput {
  kind: TransactionKind;
  amountKurus: Kurus;
  date: DateStr;
  accountId: string;
  counterAccountId: string | null;
  categoryId: string | null;
  note: string | null;
  voiceTranscript: string | null;
  source: TransactionSource;
}

/** Veritabanı satırı — supabase-js'in döndürdüğü ham şekil. */
export interface TransactionRow {
  id: string;
  kind: TransactionKind;
  amount_kurus: number;
  date: string;
  account_id: string;
  counter_account_id: string | null;
  category_id: string | null;
  note: string | null;
  voice_transcript: string | null;
  source: TransactionSource;
  created_at: string;
}

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    kind: row.kind,
    amountKurus: row.amount_kurus as Kurus,
    date: row.date as DateStr,
    accountId: row.account_id,
    counterAccountId: row.counter_account_id,
    categoryId: row.category_id,
    note: row.note,
    voiceTranscript: row.voice_transcript,
    source: row.source,
    createdAt: row.created_at,
  };
}

export function toRowInput(input: TransactionInput): Omit<TransactionRow, "id" | "created_at"> {
  return {
    kind: input.kind,
    amount_kurus: input.amountKurus,
    date: input.date,
    account_id: input.accountId,
    counter_account_id: input.counterAccountId,
    category_id: input.categoryId,
    note: input.note,
    voice_transcript: input.voiceTranscript,
    source: input.source,
  };
}

/**
 * Taslağın kaydedilebilir olup olmadığını doğrular.
 *
 * ── NEDEN İSTEMCİDE DE ──
 *
 * Veritabanı kısıtları son sözü söyler (`amount_kurus > 0`,
 * `transfer_shape`), ama kullanıcıya "işlem kaydedilemedi" demek
 * yerine hangi alanın eksik olduğunu göstermek gerekir. Bu fonksiyon
 * o mesajı üretir; kısıtları TEKRARLAMAZ, onlara hazırlık yapar.
 */
export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof TransactionInput, string>>;
}

export function validateTransaction(
  input: Partial<TransactionInput>,
): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  if (!input.kind) {
    errors.kind = "Gelir mi gider mi seçin.";
  }

  if (input.amountKurus == null) {
    errors.amountKurus = "Tutar girin.";
  } else if (input.amountKurus <= 0) {
    errors.amountKurus = "Tutar sıfırdan büyük olmalı.";
  }

  if (!input.date) {
    errors.date = "Tarih seçin.";
  }

  if (!input.accountId) {
    errors.accountId = "Hesap seçin.";
  }

  if (input.kind === "transfer") {
    if (!input.counterAccountId) {
      errors.counterAccountId = "Hedef hesap seçin.";
    } else if (input.counterAccountId === input.accountId) {
      errors.counterAccountId = "Hedef hesap kaynak hesaptan farklı olmalı.";
    }
    if (input.categoryId) {
      errors.categoryId = "Transferin kategorisi olmaz.";
    }
  }

  if (input.note && input.note.length > NOTE_MAX) {
    errors.note = `Açıklama en fazla ${NOTE_MAX} karakter olabilir.`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
