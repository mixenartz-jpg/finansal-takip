"use client";

import { useState } from "react";
import type { Transaction, TransactionKind, TransactionPatch } from "./types";
import { validateTransactionPatch } from "./types";
import type { Category } from "@/features/categories/types";
import type { Account } from "@/features/accounts/types";
import { formatTRY, parseTRYInput } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import { asDateStr } from "@/lib/date/date";
import { Button, Field, Input, Select } from "@/components/ui";

/**
 * İşlem düzenleme formu.
 *
 * DraftCard'dan AYRI tutuldu: DraftCard bir TAHMİNİ onaylatır (düşük
 * güven vurguları, ham transkript, "emin değilim" ipuçları). Burada
 * onaylanacak tahmin yok — kullanıcının kendi kaydettiği veri var.
 * İkisini tek bileşende birleştirmek, her ikisinin de anlamını
 * bulanıklaştırırdı.
 */
interface TransactionEditFormProps {
  transaction: Transaction;
  categories: readonly Category[];
  accounts: readonly Account[];
  saving: boolean;
  onSave: (patch: TransactionPatch) => void;
  onCancel: () => void;
}

export function TransactionEditForm({
  transaction,
  categories,
  accounts,
  saving,
  onSave,
  onCancel,
}: TransactionEditFormProps) {
  const [kind, setKind] = useState<TransactionKind>(transaction.kind);
  const [amountText, setAmountText] = useState(
    formatAmountForInput(transaction.amountKurus),
  );
  const [date, setDate] = useState<string>(transaction.date);
  const [accountId, setAccountId] = useState(transaction.accountId);
  const [counterAccountId, setCounterAccountId] = useState(
    transaction.counterAccountId ?? "",
  );
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? "");
  const [note, setNote] = useState(transaction.note ?? "");
  const [touched, setTouched] = useState(false);

  const amountKurus = parseTRYInput(amountText);
  const availableCategories = categories.filter((c) => c.kind === kind);

  const candidate: Partial<TransactionPatch> = {
    kind,
    amountKurus: amountKurus ?? undefined,
    date: date === "" ? undefined : (date as DateStr),
    accountId: accountId || undefined,
    counterAccountId: kind === "transfer" ? counterAccountId || null : null,
    categoryId: kind === "transfer" ? null : categoryId || null,
    note: note.trim() || null,
  };

  const validation = validateTransactionPatch(candidate);
  const err = (field: keyof TransactionPatch) =>
    touched ? (validation.errors[field] ?? null) : null;

  function handleSubmit() {
    setTouched(true);
    if (!validation.valid) return;

    onSave({
      kind,
      amountKurus: amountKurus as Kurus,
      date: asDateStr(date),
      accountId,
      counterAccountId: kind === "transfer" ? counterAccountId : null,
      categoryId: kind === "transfer" ? null : categoryId || null,
      note: note.trim() || null,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tür" htmlFor="edit-kind" error={err("kind")}>
          <Select
            id="edit-kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as TransactionKind);
              // Tür değişince kategori geçersizleşir: gelir
              // kategorisi giderde seçili kalamaz.
              setCategoryId("");
            }}
          >
            <option value="expense">Gider</option>
            <option value="income">Gelir</option>
            <option value="transfer">Transfer</option>
          </Select>
        </Field>

        <Field label="Tutar" htmlFor="edit-amount" error={err("amountKurus")}>
          <Input
            id="edit-amount"
            inputMode="decimal"
            className="tnum"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0,00"
          />
          {amountKurus != null && (
            <p className="tnum text-[13px] text-[var(--ink-3)]">
              {formatTRY(amountKurus)}
            </p>
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tarih" htmlFor="edit-date" error={err("date")}>
          <Input
            id="edit-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>

        <Field label="Hesap" htmlFor="edit-account" error={err("accountId")}>
          <Select
            id="edit-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {kind === "transfer" ? (
        <Field label="Hedef hesap" htmlFor="edit-counter" error={err("counterAccountId")}>
          <Select
            id="edit-counter"
            value={counterAccountId}
            onChange={(e) => setCounterAccountId(e.target.value)}
          >
            <option value="">Seçin…</option>
            {accounts
              .filter((a) => a.id !== accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </Field>
      ) : (
        <Field label="Kategori" htmlFor="edit-category" error={err("categoryId")}>
          <Select
            id="edit-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Kategorisiz</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Açıklama" htmlFor="edit-note" error={err("note")}>
        <Input
          id="edit-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="İsteğe bağlı"
        />
      </Field>

      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={handleSubmit} loading={saving} full>
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}

/** Kuruşu form girdisi biçimine çevirir: 20000 → "200,00" */
function formatAmountForInput(kurus: Kurus): string {
  const lira = Math.floor(Math.abs(kurus) / 100);
  const kr = Math.abs(kurus) % 100;
  return kr === 0 ? String(lira) : `${lira},${String(kr).padStart(2, "0")}`;
}
