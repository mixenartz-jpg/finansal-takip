"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { formatTRY, parseTRYInput } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import type { Category } from "@/features/categories/types";
import { validateBudget, type BudgetInput, type BudgetProgress } from "./types";

/**
 * Bütçe ekleme / düzenleme formu.
 *
 * Tek form ikisini de yapar: `existing` verilirse kategori kilitli
 * gelir ve limit düzenlenir, verilmezse kategori seçilir. Ayrı iki
 * bileşen aynı doğrulamayı ve aynı tutar ayrıştırmasını iki kez
 * yazdırırdı.
 */

interface BudgetFormProps {
  /** Yalnızca GİDER kategorileri — gelire bütçe konmaz. */
  categories: readonly Category[];
  month: DateStr;
  /** Düzenlenen bütçe; yeni kayıtta undefined. */
  existing?: BudgetProgress;
  /** Bu ay zaten limiti olan kategoriler — yenide listeden çıkarılır. */
  usedCategoryIds?: readonly string[];
  saving: boolean;
  onSave: (input: BudgetInput) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function BudgetForm({
  categories,
  month,
  existing,
  usedCategoryIds = [],
  saving,
  onSave,
  onDelete,
  onCancel,
}: BudgetFormProps) {
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [limitText, setLimitText] = useState(
    existing ? formatForInput(existing.limitKurus) : "",
  );
  const [touched, setTouched] = useState(false);

  const limitKurus = parseTRYInput(limitText);

  // Düzenlemede mevcut kategori listede kalmalı; yeni kayıtta zaten
  // limiti olan kategoriler gizlenir (upsert onları ezerdi).
  const available = categories.filter(
    (c) => c.id === existing?.categoryId || !usedCategoryIds.includes(c.id),
  );

  const candidate: Partial<BudgetInput> = {
    categoryId: categoryId || undefined,
    month,
    limitKurus: limitKurus ?? undefined,
  };
  const validation = validateBudget(candidate);

  function handleSubmit() {
    setTouched(true);
    if (!validation.valid) return;
    onSave({ categoryId, month, limitKurus: limitKurus as Kurus });
  }

  const err = (f: keyof BudgetInput) =>
    touched ? (validation.errors[f] ?? null) : null;

  return (
    <div className="flex flex-col gap-4">
      <Field label="Kategori" htmlFor="budget-category" error={err("categoryId")}>
        <Select
          id="budget-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={Boolean(existing)}
        >
          <option value="">Seçin…</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Aylık limit"
        htmlFor="budget-limit"
        error={err("limitKurus")}
        hint={limitKurus != null ? formatTRY(limitKurus) : undefined}
      >
        <Input
          id="budget-limit"
          inputMode="decimal"
          className="tnum"
          value={limitText}
          onChange={(e) => setLimitText(e.target.value)}
          placeholder="0,00"
          autoFocus
        />
      </Field>

      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={handleSubmit} loading={saving} full>
          Kaydet
        </Button>
        {onDelete && (
          <Button variant="ghost" onClick={onDelete} disabled={saving}>
            Sil
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}

/** Kuruşu form girdisi biçimine çevirir: 500000 → "5000" */
function formatForInput(kurus: Kurus): string {
  const lira = Math.floor(Math.abs(kurus) / 100);
  const kr = Math.abs(kurus) % 100;
  return kr === 0 ? String(lira) : `${lira},${String(kr).padStart(2, "0")}`;
}
