"use client";

import { useState } from "react";
import type { Account, AccountInput, AccountKind } from "./types";
import { validateAccount, ACCOUNT_KIND_LABELS } from "./types";
import { formatTRY, parseTRYInput } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import { Button, Field, Input, Select } from "@/components/ui";

interface AccountEditFormProps {
  account: Account;
  saving: boolean;
  onSave: (input: AccountInput) => void;
  onCancel: () => void;
}

export function AccountEditForm({
  account,
  saving,
  onSave,
  onCancel,
}: AccountEditFormProps) {
  const [name, setName] = useState(account.name);
  const [kind, setKind] = useState<AccountKind>(account.kind);
  const [openingText, setOpeningText] = useState(
    formatAmountForInput(account.openingKurus),
  );
  const [limitText, setLimitText] = useState(
    account.creditLimitKurus != null
      ? formatAmountForInput(account.creditLimitKurus)
      : "",
  );
  const [touched, setTouched] = useState(false);

  const openingKurus = parseTRYInput(openingText);
  // Kredi limiti YALNIZCA kredi kartında anlamlı; tür değişince
  // alan gizlenir ve değer gönderilmez (şemadaki
  // credit_limit_only_on_card kısıtı).
  const creditLimitKurus =
    kind === "credit_card" && limitText.trim() !== ""
      ? parseTRYInput(limitText)
      : null;

  const candidate: Partial<AccountInput> = {
    name,
    kind,
    openingKurus: openingKurus ?? undefined,
    creditLimitKurus,
  };

  const validation = validateAccount(candidate);
  const err = (field: keyof AccountInput) =>
    touched ? (validation.errors[field] ?? null) : null;

  function handleSubmit() {
    setTouched(true);
    if (!validation.valid || openingKurus == null) return;
    onSave({
      name: name.trim(),
      kind,
      openingKurus: openingKurus as Kurus,
      creditLimitKurus,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Hesap adı" htmlFor="acc-name" error={err("name")}>
        <Input
          id="acc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label="Tür" htmlFor="acc-kind" error={err("kind")}>
        <Select
          id="acc-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as AccountKind)}
        >
          {(Object.keys(ACCOUNT_KIND_LABELS) as AccountKind[]).map((k) => (
            <option key={k} value={k}>
              {ACCOUNT_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Açılış bakiyesi"
        htmlFor="acc-opening"
        hint="Hesap açıldığındaki tutar. Değiştirmek güncel bakiyeyi kaydırır."
        error={err("openingKurus")}
      >
        <Input
          id="acc-opening"
          inputMode="decimal"
          className="tnum"
          value={openingText}
          onChange={(e) => setOpeningText(e.target.value)}
          placeholder="0,00"
        />
        {openingKurus != null && (
          <p className="tnum text-[13px] text-[var(--ink-3)]">
            {formatTRY(openingKurus)}
          </p>
        )}
      </Field>

      {kind === "credit_card" && (
        <Field label="Kredi limiti" htmlFor="acc-limit" error={err("creditLimitKurus")}>
          <Input
            id="acc-limit"
            inputMode="decimal"
            className="tnum"
            value={limitText}
            onChange={(e) => setLimitText(e.target.value)}
            placeholder="0,00"
          />
        </Field>
      )}

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
  const sign = kurus < 0 ? "-" : "";
  return kr === 0 ? `${sign}${lira}` : `${sign}${lira},${String(kr).padStart(2, "0")}`;
}
