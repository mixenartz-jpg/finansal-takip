"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { formatTRY, formatTRYCompact, parseTRYInput } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import { asDateStr, todayStr } from "@/lib/date/date";
import type { Account } from "@/features/accounts/types";
import { validatePayment, type DebtBalance, type PaymentInput } from "./types";

/**
 * Borç ödemesi / alacak tahsilatı formu.
 *
 * ── "HESABIMDAN ÇIKTI" KUTUSU (ürün kararı) ──
 *
 * Borcu bankadan ödediyseniz bakiyeniz de düşmeli; elden nakit
 * verdiyseniz düşmemeli. Her ödemeyi otomatik işleme çevirmek
 * ikinci durumda bakiyeyi yanlış düşürür; hiç çevirmemek ilkinde
 * aynı ödemeyi iki kez girmeyi gerektirir. Seçenek, ikisini de
 * doğru yapan tek yol.
 */

interface PaymentFormProps {
  debt: DebtBalance;
  accounts: readonly Account[];
  saving: boolean;
  onSave: (input: PaymentInput) => void;
  onCancel: () => void;
}

export function PaymentForm({
  debt,
  accounts,
  saving,
  onSave,
  onCancel,
}: PaymentFormProps) {
  // Varsayılan: kalan borcun tamamı. En sık durum borcu tümüyle
  // kapatmaktır; kısmi ödeme yapan kullanıcı tutarı düzeltir.
  const [amountText, setAmountText] = useState(
    formatForInput(debt.remainingKurus),
  );
  const [date, setDate] = useState<string>(todayStr());
  const [note, setNote] = useState("");
  const [createTransaction, setCreateTransaction] = useState(true);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [touched, setTouched] = useState(false);

  const amountKurus = parseTRYInput(amountText);

  const candidate: Partial<PaymentInput> = {
    debtId: debt.debtId,
    amountKurus: amountKurus ?? undefined,
    date: date ? (date as DateStr) : undefined,
    note: note.trim() || null,
    createTransaction,
    accountId: createTransaction ? accountId || null : null,
  };

  const validation = validatePayment(candidate, {
    openedOn: debt.openedOn,
    remainingKurus: debt.remainingKurus,
  });

  function handleSubmit() {
    setTouched(true);
    if (!validation.valid) return;
    onSave({
      debtId: debt.debtId,
      amountKurus: amountKurus as Kurus,
      date: asDateStr(date),
      note: note.trim() || null,
      createTransaction,
      accountId: createTransaction ? accountId : null,
    });
  }

  const err = (f: keyof PaymentInput) =>
    touched ? (validation.errors[f] ?? null) : null;

  const isPayable = debt.direction === "payable";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[var(--r-md)] bg-[var(--surface-2)] px-3 py-2">
        <p className="text-[13px] text-[var(--ink-3)]">
          {isPayable ? "Borcum" : "Alacağım"} · {debt.counterparty}
        </p>
        <p className="tnum text-sm text-[var(--ink)]">
          Kalan {formatTRYCompact(debt.remainingKurus)}
        </p>
      </div>

      <Field
        label="Ödeme tutarı"
        htmlFor="pay-amount"
        error={err("amountKurus")}
        hint={amountKurus != null ? formatTRY(amountKurus) : undefined}
      >
        <Input
          id="pay-amount"
          inputMode="decimal"
          className="tnum"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="0,00"
          autoFocus
        />
      </Field>

      {/* Uyarı ENGELLEMEZ: faizli bir borç kalan anaparadan fazla
          ödenebilir ya da anapara yanlış girilmiş olabilir. */}
      {validation.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-[var(--r-md)] bg-[var(--warning-soft)] px-3 py-2">
          {validation.warnings.map((w) => (
            <li key={w} className="text-[13px] text-[var(--warning)]">
              {w}
            </li>
          ))}
        </ul>
      )}

      <Field label="Tarih" htmlFor="pay-date" error={err("date")}>
        <Input
          id="pay-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--border)] px-3 py-3">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={createTransaction}
            onChange={(e) => setCreateTransaction(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
          />
          <span>
            <span className="block text-sm text-[var(--ink)]">
              {isPayable ? "Bu ödeme hesabımdan çıktı" : "Bu tahsilat hesabıma girdi"}
            </span>
            <span className="block text-[13px] text-[var(--ink-3)]">
              {isPayable
                ? "İşaretlerseniz bir gider işlemi oluşur ve bakiye düşer."
                : "İşaretlerseniz bir gelir işlemi oluşur ve bakiye artar."}
            </span>
          </span>
        </label>

        {createTransaction && (
          <Field label="Hesap" htmlFor="pay-account" error={err("accountId")}>
            <Select
              id="pay-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Seçin…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <Field label="Açıklama" htmlFor="pay-note" error={err("note")}>
        <Input
          id="pay-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="İsteğe bağlı"
        />
      </Field>

      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={handleSubmit} loading={saving} full>
          Ödemeyi kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}

function formatForInput(kurus: Kurus): string {
  const lira = Math.floor(Math.abs(kurus) / 100);
  const kr = Math.abs(kurus) % 100;
  return kr === 0 ? String(lira) : `${lira},${String(kr).padStart(2, "0")}`;
}
