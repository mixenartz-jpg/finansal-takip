import type { DateStr } from "@/lib/date/types";
import { isDateStr } from "@/lib/date/date";
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
  /** Bu islemi ureten duzenli islem sablonu (varsa). */
  recurringId: string | null;
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
  recurring_id: string | null;
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
    recurringId: row.recurring_id,
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
    recurring_id: null,
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
  } else if (!isDateStr(input.date)) {
    // `DateStr` markalı tip DERLEME zamanında korur; bu kontrol
    // ÇALIŞMA zamanı savunmasıdır. Parser, form girdisi ya da
    // ileride eklenecek bir API çağrısı "2026-02-31" gibi takvimde
    // olmayan bir dize üretebilir — markalı tip bunu fark etmez,
    // çünkü şekil doğru, değer yanlış.
    errors.date = "Geçerli bir tarih seçin.";
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

/**
 * Düzenlenebilir alanlar.
 *
 * `source` ve `voiceTranscript` KASITLI OLARAK DIŞARIDA: bir işlemin
 * sesle eklendiği bilgisi ve ham transkripti geçmiş kaydıdır,
 * düzenlemeyle değişmez. Transkript ayrıca parser'ı geliştirmek için
 * tutulan gerçek korpustur — kullanıcı tutarı düzeltince silinmemeli.
 */
export type TransactionPatch = Pick<
  TransactionInput,
  "kind" | "amountKurus" | "date" | "accountId" | "counterAccountId" | "categoryId" | "note"
>;

/**
 * Yamayı doğrular.
 *
 * `validateTransaction`'ı yeniden kullanır: aynı kuralları ikinci kez
 * yazmak, biri değiştiğinde diğerinin sessizce eskimesi demektir.
 * Yamada bulunmayan alanlar (`voiceTranscript`, `source`) doğrulama
 * için gerekli olmadığından yer tutucu değerlerle beslenir.
 */
export function validateTransactionPatch(
  patch: Partial<TransactionPatch>,
): ValidationResult {
  return validateTransaction({
    ...patch,
    voiceTranscript: null,
    source: "manual",
  });
}

/** Yamayı veritabanı sütun adlarına çevirir. */
export function toPatchRow(patch: TransactionPatch): Record<string, unknown> {
  return {
    kind: patch.kind,
    amount_kurus: patch.amountKurus,
    date: patch.date,
    account_id: patch.accountId,
    counter_account_id: patch.counterAccountId,
    category_id: patch.categoryId,
    note: patch.note,
  };
}
