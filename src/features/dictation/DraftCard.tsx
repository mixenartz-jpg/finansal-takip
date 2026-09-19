"use client";

import { useState } from "react";
import type { ParseResult } from "@/features/parser/types";
import type { Category } from "@/features/categories/types";
import type { Account } from "@/features/accounts/types";
import type { TransactionInput, TransactionKind } from "@/features/transactions/types";
import { validateTransaction } from "@/features/transactions/types";
import { formatTRY, parseTRYInput } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import { asDateStr } from "@/lib/date/date";
import { Button, Field, Input, Select } from "@/components/ui";

/**
 * Onay kartı — dikte akışının en önemli ekranı.
 *
 * ── ASLA OTOMATİK KAYDETMEZ ──
 *
 * Parser bir TAHMİN üretir; tahmin sessizce veritabanına yazılırsa
 * kullanıcı yanlışı aylar sonra fark eder ve o zamana kadar tüm
 * raporlar bozulmuştur. Bu kart, kaydetmeden önceki son ve tek
 * duraktır: her alan düzenlenebilir, düşük güvenli alanlar
 * vurgulanır, ham transkript görünür kalır.
 *
 * ── DÜŞÜK GÜVEN VURGUSU ──
 *
 * Parser'ın emin olmadığı alan işaretlenir. Kullanıcı hangi alana
 * bakması gerektiğini bilmezse ya hepsini tek tek kontrol eder
 * (yavaş) ya da hiçbirine bakmaz (riskli).
 */

const LOW_CONFIDENCE = 0.6;

interface DraftCardProps {
  result: ParseResult;
  transcript: string;
  categories: readonly Category[];
  accounts: readonly Account[];
  saving: boolean;
  onSave: (input: TransactionInput) => void;
  onCancel: () => void;
}

export function DraftCard({
  result,
  transcript,
  categories,
  accounts,
  saving,
  onSave,
  onCancel,
}: DraftCardProps) {
  const { draft, confidence, warnings } = result;

  const [kind, setKind] = useState<TransactionKind | "">(draft.kind ?? "");
  const [amountText, setAmountText] = useState(
    draft.amountKurus != null ? formatAmountForInput(draft.amountKurus) : "",
  );
  const [date, setDate] = useState<string>(draft.date ?? "");
  const [categoryId, setCategoryId] = useState(draft.categoryId ?? "");
  const [accountId, setAccountId] = useState(draft.accountId ?? "");
  const [counterAccountId, setCounterAccountId] = useState(draft.counterAccountId ?? "");
  const [note, setNote] = useState(draft.note ?? "");
  const [touched, setTouched] = useState(false);

  const amountKurus = parseTRYInput(amountText);

  // Kategori listesi işlem türüne göre filtrelenir: gelir işlemine
  // gider kategorisi seçilmesi `check_category_kind` trigger'ı
  // tarafından zaten reddedilirdi.
  const availableCategories = categories.filter((c) => c.kind === kind);

  const candidate: Partial<TransactionInput> = {
    kind: kind === "" ? undefined : kind,
    amountKurus: amountKurus ?? undefined,
    date: date === "" ? undefined : (date as DateStr),
    accountId: accountId || undefined,
    counterAccountId: kind === "transfer" ? counterAccountId || null : null,
    categoryId: kind === "transfer" ? null : categoryId || null,
    note: note.trim() || null,
  };

  const validation = validateTransaction(candidate);

  function handleSave() {
    setTouched(true);
    if (!validation.valid) return;

    onSave({
      kind: kind as TransactionKind,
      amountKurus: amountKurus as Kurus,
      date: asDateStr(date),
      accountId,
      counterAccountId: kind === "transfer" ? counterAccountId : null,
      categoryId: kind === "transfer" ? null : categoryId || null,
      note: note.trim() || null,
      // ★ Ham transkript saklanır: kullanıcı "ne demiştim" diye
      // bakabilsin ve parser geliştirilirken gerçek korpus olsun.
      voiceTranscript: transcript || null,
      source: "voice",
    });
  }

  const err = (field: keyof TransactionInput) =>
    touched ? (validation.errors[field] ?? null) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Ham transkript — neyin ayrıştırıldığı her zaman görünür. */}
      <div className="rounded-[var(--r-md)] bg-[var(--surface-2)] px-3 py-2">
        <p className="text-[12px] font-medium text-[var(--ink-3)]">Duyduğum</p>
        <p className="text-sm text-[var(--ink)]">&ldquo;{transcript}&rdquo;</p>
      </div>

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-[var(--r-md)] bg-[var(--warning-soft)] px-3 py-2">
          {warnings.map((w) => (
            <li key={w} className="text-[13px] text-[var(--warning)]">
              {w}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tür" htmlFor="draft-kind" error={err("kind")}>
          <Select
            id="draft-kind"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as TransactionKind | "";
              setKind(next);
              // Tür değişince kategori geçersizleşir: gelir
              // kategorisi giderde seçili kalamaz.
              setCategoryId("");
            }}
            aria-describedby={confidence.kind < LOW_CONFIDENCE ? "kind-low" : undefined}
          >
            <option value="">Seçin…</option>
            <option value="expense">Gider</option>
            <option value="income">Gelir</option>
            <option value="transfer">Transfer</option>
          </Select>
          {confidence.kind < LOW_CONFIDENCE && (
            <LowConfidenceHint id="kind-low" />
          )}
        </Field>

        <Field label="Tutar" htmlFor="draft-amount" error={err("amountKurus")}>
          <Input
            id="draft-amount"
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
        <Field label="Tarih" htmlFor="draft-date" error={err("date")}>
          <Input
            id="draft-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>

        <Field label="Hesap" htmlFor="draft-account" error={err("accountId")}>
          <Select
            id="draft-account"
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
          {confidence.accountId < 0.5 && accounts.length > 1 && (
            <LowConfidenceHint id="account-low" text="varsayılan seçildi" />
          )}
        </Field>
      </div>

      {kind === "transfer" ? (
        <Field
          label="Hedef hesap"
          htmlFor="draft-counter"
          error={err("counterAccountId")}
        >
          <Select
            id="draft-counter"
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
        <Field label="Kategori" htmlFor="draft-category" error={err("categoryId")}>
          <Select
            id="draft-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={kind === ""}
          >
            <option value="">Kategorisiz</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {kind !== "" && confidence.categoryId === 0 && (
            <LowConfidenceHint id="cat-low" text="bulunamadı" />
          )}
        </Field>
      )}

      <Field label="Açıklama" htmlFor="draft-note">
        <Input
          id="draft-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="İsteğe bağlı"
        />
      </Field>

      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={handleSave} loading={saving} full>
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}

function LowConfidenceHint({ id, text = "emin değilim, kontrol edin" }: { id: string; text?: string }) {
  return (
    <p id={id} className="text-[12px] text-[var(--warning)]">
      {text}
    </p>
  );
}

/** Kuruşu form girdisi biçimine çevirir: 20000 → "200,00" */
function formatAmountForInput(kurus: Kurus): string {
  const lira = Math.floor(Math.abs(kurus) / 100);
  const kr = Math.abs(kurus) % 100;
  return kr === 0 ? String(lira) : `${lira},${String(kr).padStart(2, "0")}`;
}
