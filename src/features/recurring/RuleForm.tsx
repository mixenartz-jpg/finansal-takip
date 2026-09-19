"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { formatTRY, parseTRYInput } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import { asDateStr, todayStr } from "@/lib/date/date";
import { WEEKDAYS_TR, MONTHS_TR } from "@/lib/ui/tr";
import type { Category } from "@/features/categories/types";
import type { Account } from "@/features/accounts/types";
import {
  validateRule,
  FREQ_LABELS,
  type RecurFreq,
  type RecurringRule,
  type RecurringRuleInput,
} from "./types";

/**
 * Düzenli işlem şablonu formu.
 *
 * ── SIKLIK, GÜN ALANINI DEĞİŞTİRİR ──
 *
 * Haftalıkta gün = hafta günü (Pazartesi…Pazar), aylık/yıllıkta =
 * ayın günü (1-31). Tek bir "gün" alanı bırakıp kullanıcıdan doğru
 * aralığı tahmin etmesini beklemek, şemadaki `weekly_day_in_range`
 * kısıtına takılan bir form üretirdi.
 */

interface RuleFormProps {
  categories: readonly Category[];
  accounts: readonly Account[];
  existing?: RecurringRule;
  saving: boolean;
  onSave: (input: RecurringRuleInput) => void;
  onCancel: () => void;
}

export function RuleForm({
  categories,
  accounts,
  existing,
  saving,
  onSave,
  onCancel,
}: RuleFormProps) {
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<"income" | "expense">(existing?.kind ?? "expense");
  const [amountText, setAmountText] = useState(
    existing ? formatForInput(existing.amountKurus) : "",
  );
  const [accountId, setAccountId] = useState(
    existing?.accountId ?? accounts[0]?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [freq, setFreq] = useState<RecurFreq>(existing?.freq ?? "monthly");
  const [dayOf, setDayOf] = useState<number>(existing?.dayOf ?? 1);
  const [monthOf, setMonthOf] = useState<number | null>(existing?.monthOf ?? null);
  const [startDate, setStartDate] = useState<string>(
    existing?.startDate ?? todayStr(),
  );
  const [endDate, setEndDate] = useState<string>(existing?.endDate ?? "");
  const [touched, setTouched] = useState(false);

  const amountKurus = parseTRYInput(amountText);
  const availableCategories = categories.filter((c) => c.kind === kind);

  const candidate: Partial<RecurringRuleInput> = {
    name,
    kind,
    amountKurus: amountKurus ?? undefined,
    accountId: accountId || undefined,
    categoryId: categoryId || null,
    note: null,
    freq,
    dayOf,
    monthOf: freq === "yearly" ? monthOf : null,
    startDate: startDate ? (startDate as DateStr) : undefined,
    endDate: endDate ? (endDate as DateStr) : null,
  };
  const validation = validateRule(candidate);

  function handleFreqChange(next: RecurFreq) {
    setFreq(next);
    // Gün alanının anlamı değişti; eski değer yeni aralıkta geçersiz
    // olabilir (örn. aylık 25 → haftalık 25 diye bir gün yok).
    setDayOf(1);
    setMonthOf(next === "yearly" ? 1 : null);
  }

  function handleSubmit() {
    setTouched(true);
    if (!validation.valid) return;
    onSave({
      name: name.trim(),
      kind,
      amountKurus: amountKurus as Kurus,
      accountId,
      categoryId: categoryId || null,
      note: null,
      freq,
      dayOf,
      monthOf: freq === "yearly" ? monthOf : null,
      startDate: asDateStr(startDate),
      endDate: endDate ? asDateStr(endDate) : null,
    });
  }

  const err = (f: keyof RecurringRuleInput) =>
    touched ? (validation.errors[f] ?? null) : null;

  return (
    <div className="flex flex-col gap-4">
      <Field label="Ad" htmlFor="rule-name" error={err("name")}>
        <Input
          id="rule-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Kira, Maaş, Netflix…"
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tür" htmlFor="rule-kind" error={err("kind")}>
          <Select
            id="rule-kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as "income" | "expense");
              setCategoryId("");
            }}
          >
            <option value="expense">Gider</option>
            <option value="income">Gelir</option>
          </Select>
        </Field>

        <Field
          label="Tutar"
          htmlFor="rule-amount"
          error={err("amountKurus")}
          hint={amountKurus != null ? formatTRY(amountKurus) : undefined}
        >
          <Input
            id="rule-amount"
            inputMode="decimal"
            className="tnum"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0,00"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Hesap" htmlFor="rule-account" error={err("accountId")}>
          <Select
            id="rule-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Seçin…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Kategori" htmlFor="rule-category">
          <Select
            id="rule-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Kategorisiz</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tekrar" htmlFor="rule-freq" error={err("freq")}>
          <Select
            id="rule-freq"
            value={freq}
            onChange={(e) => handleFreqChange(e.target.value as RecurFreq)}
          >
            {(Object.keys(FREQ_LABELS) as RecurFreq[]).map((f) => (
              <option key={f} value={f}>{FREQ_LABELS[f]}</option>
            ))}
          </Select>
        </Field>

        {freq === "weekly" ? (
          <Field label="Gün" htmlFor="rule-day" error={err("dayOf")}>
            <Select
              id="rule-day"
              value={dayOf}
              onChange={(e) => setDayOf(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>{WEEKDAYS_TR[d]}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Ayın günü" htmlFor="rule-day" error={err("dayOf")}>
            <Select
              id="rule-day"
              value={dayOf}
              onChange={(e) => setDayOf(Number(e.target.value))}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d === 31 ? "Son gün" : d}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {freq === "yearly" && (
        <Field label="Ay" htmlFor="rule-month" error={err("monthOf")}>
          <Select
            id="rule-month"
            value={monthOf ?? 1}
            onChange={(e) => setMonthOf(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{MONTHS_TR[m]}</option>
            ))}
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Başlangıç" htmlFor="rule-start" error={err("startDate")}>
          <Input
            id="rule-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>

        <Field
          label="Bitiş"
          htmlFor="rule-end"
          error={err("endDate")}
          hint="Boş bırakırsanız süresiz"
        >
          <Input
            id="rule-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>

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

function formatForInput(kurus: Kurus): string {
  const lira = Math.floor(Math.abs(kurus) / 100);
  const kr = Math.abs(kurus) % 100;
  return kr === 0 ? String(lira) : `${lira},${String(kr).padStart(2, "0")}`;
}
