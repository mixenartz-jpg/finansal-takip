"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { formatTRY, parseTRYInput } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import { asDateStr, todayStr } from "@/lib/date/date";
import {
  validateDebt,
  DIRECTION_LABELS,
  type DebtBalance,
  type DebtDirection,
  type DebtInput,
} from "./types";

interface DebtFormProps {
  existing?: DebtBalance;
  saving: boolean;
  onSave: (input: DebtInput) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function DebtForm({
  existing,
  saving,
  onSave,
  onDelete,
  onCancel,
}: DebtFormProps) {
  const [direction, setDirection] = useState<DebtDirection>(
    existing?.direction ?? "payable",
  );
  const [counterparty, setCounterparty] = useState(existing?.counterparty ?? "");
  const [amountText, setAmountText] = useState(
    existing ? formatForInput(existing.principalKurus) : "",
  );
  const [openedOn, setOpenedOn] = useState<string>(
    existing?.openedOn ?? todayStr(),
  );
  const [dueOn, setDueOn] = useState<string>(existing?.dueOn ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [touched, setTouched] = useState(false);

  const principalKurus = parseTRYInput(amountText);

  const candidate: Partial<DebtInput> = {
    direction,
    counterparty,
    principalKurus: principalKurus ?? undefined,
    openedOn: openedOn ? (openedOn as DateStr) : undefined,
    dueOn: dueOn ? (dueOn as DateStr) : null,
    note: note.trim() || null,
  };
  const validation = validateDebt(candidate);

  function handleSubmit() {
    setTouched(true);
    if (!validation.valid) return;
    onSave({
      direction,
      counterparty: counterparty.trim(),
      principalKurus: principalKurus as Kurus,
      openedOn: asDateStr(openedOn),
      dueOn: dueOn ? asDateStr(dueOn) : null,
      note: note.trim() || null,
    });
  }

  const err = (f: keyof DebtInput) =>
    touched ? (validation.errors[f] ?? null) : null;

  return (
    <div className="flex flex-col gap-4">
      <Field label="Yön" htmlFor="debt-direction" error={err("direction")}>
        <Select
          id="debt-direction"
          value={direction}
          onChange={(e) => setDirection(e.target.value as DebtDirection)}
        >
          {(Object.keys(DIRECTION_LABELS) as DebtDirection[]).map((d) => (
            <option key={d} value={d}>
              {DIRECTION_LABELS[d]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={direction === "payable" ? "Kime borçluyum" : "Kim borçlu"}
        htmlFor="debt-counterparty"
        error={err("counterparty")}
      >
        <Input
          id="debt-counterparty"
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder="Ahmet, Banka, İş yeri…"
          autoFocus
        />
      </Field>

      <Field
        label="Tutar"
        htmlFor="debt-amount"
        error={err("principalKurus")}
        hint={principalKurus != null ? formatTRY(principalKurus) : undefined}
      >
        <Input
          id="debt-amount"
          inputMode="decimal"
          className="tnum"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="0,00"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tarih" htmlFor="debt-opened" error={err("openedOn")}>
          <Input
            id="debt-opened"
            type="date"
            value={openedOn}
            onChange={(e) => setOpenedOn(e.target.value)}
          />
        </Field>

        <Field
          label="Son ödeme"
          htmlFor="debt-due"
          error={err("dueOn")}
          hint="Boş bırakırsanız vadesiz"
        >
          <Input
            id="debt-due"
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Açıklama" htmlFor="debt-note" error={err("note")}>
        <Input
          id="debt-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="İsteğe bağlı"
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

function formatForInput(kurus: Kurus): string {
  const lira = Math.floor(Math.abs(kurus) / 100);
  const kr = Math.abs(kurus) % 100;
  return kr === 0 ? String(lira) : `${lira},${String(kr).padStart(2, "0")}`;
}
