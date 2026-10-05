"use client";

import { useAccounts } from "@/features/accounts/queries";
import { ACCOUNT_KIND_LABELS, type Account } from "@/features/accounts/types";
import { useCategories } from "@/features/categories/queries";
import type { Category } from "@/features/categories/types";
import { useDebtBalances } from "@/features/debts/queries";
import { DIRECTION_LABELS, type DebtBalance } from "@/features/debts/types";
import { useRecurringRules } from "@/features/recurring/queries";
import { FREQ_LABELS, type RecurringRule } from "@/features/recurring/types";
import { useTransactionsRange } from "@/features/transactions/queries";
import type { Transaction } from "@/features/transactions/types";
import { todayStr } from "@/lib/date/date";
import { formatTRY } from "@/lib/money/money";
import { formatLongDate } from "@/lib/ui/tr";
import type { Intent } from "./intent";
import {
  candidateProblem,
  matchByName,
  matchTransactions,
  transactionRange,
  type TargetSpec,
} from "./targets";

/**
 * Onay kartındaki kayıt seçicisi.
 *
 * Model kaydı yalnızca TARİF eder; adaylar burada, istemcinin kendi
 * önbelleğinden bulunur ve kullanıcı hangisi olduğunu seçer. Kimlik
 * tarayıcıdan hiç çıkmaz. Eşleme mantığı `targets.ts` içinde, saf ve
 * test edilmiş durumda; bu dosya yalnızca veriyi getirip çiziyor.
 */

/** Seçilen kayıt — onay sonrası güncelleme çevirisine olduğu gibi gider. */
export type Target =
  | { type: "transaction"; id: string; record: Transaction }
  | { type: "account"; id: string; record: Account }
  | { type: "category"; id: string; record: Category }
  | { type: "rule"; id: string; record: RecurringRule }
  | { type: "debt"; id: string; record: DebtBalance };

export interface TargetCandidates {
  loading: boolean;
  candidates: Target[];
  /** Kullanıcıya söylenecek sorun (aday yok, çok fazla, aralık geçersiz). */
  problem: string | null;
}

/**
 * Tarife uyan adayları getirir.
 *
 * Hook'lar koşulsuz çağrılıyor (React kuralı) ama yalnızca gereken
 * sorgu `enabled`: hesap seçen bir kart borçları çekmemeli. Hesap ve
 * kategori listeleri asistan panelinde zaten yüklü.
 */
export function useTargetCandidates(intent: Intent, spec: TargetSpec | null): TargetCandidates {
  const kind = spec?.kind ?? null;
  const range = kind === "transaction" ? transactionRange(intent.args) : null;
  const today = todayStr();

  const accounts = useAccounts();
  const categories = useCategories();
  const txs = useTransactionsRange(
    range?.ok ? range.from : today,
    range?.ok ? range.to : today,
    { enabled: range?.ok === true },
  );
  const rules = useRecurringRules({ enabled: kind === "rule" });
  const debts = useDebtBalances({ enabled: kind === "debt" });

  const result = (loading: boolean, candidates: Target[]): TargetCandidates => ({
    loading,
    candidates,
    problem: loading ? null : candidateProblem(candidates.length),
  });

  switch (kind) {
    case null:
      return { loading: false, candidates: [], problem: null };

    case "transaction": {
      if (range && !range.ok) return { loading: false, candidates: [], problem: range.error };
      const list = matchTransactions(txs.data ?? [], intent.args, categories.data ?? []);
      return result(
        txs.isPending || categories.isPending,
        list.map((record) => ({ type: "transaction", id: record.id, record })),
      );
    }

    case "account": {
      const list = matchByName(accounts.data ?? [], intent.args.accountName, (a) => a.name);
      return result(
        accounts.isPending,
        list.map((record) => ({ type: "account", id: record.id, record })),
      );
    }

    case "category": {
      const list = matchByName(categories.data ?? [], intent.args.categoryName, (c) => c.name);
      return result(
        categories.isPending,
        list.map((record) => ({ type: "category", id: record.id, record })),
      );
    }

    case "rule": {
      const list = matchByName(rules.data ?? [], intent.args.ruleName, (r) => r.name);
      return result(
        rules.isPending,
        list.map((record) => ({ type: "rule", id: record.id, record })),
      );
    }

    case "debt": {
      const list = matchByName(
        debts.data ?? [],
        intent.args.debtCounterparty,
        (d) => d.counterparty,
      );
      return result(
        debts.isPending,
        list.map((record) => ({ type: "debt", id: record.id, record })),
      );
    }
  }
}

/** Adayın okunur satırı: ana metin, ikincil metin ve (varsa) tutar. */
function describe(
  t: Target,
  names: { category: Map<string, string>; account: Map<string, string> },
): { primary: string; secondary: string | null; amount: string | null } {
  switch (t.type) {
    case "transaction": {
      const r = t.record;
      const what =
        r.kind === "transfer"
          ? `Transfer → ${names.account.get(r.counterAccountId ?? "") ?? "?"}`
          : (r.categoryId ? names.category.get(r.categoryId) : null) ?? "Kategorisiz";
      return {
        primary: `${formatLongDate(r.date)} · ${what}`,
        secondary: [names.account.get(r.accountId), r.note].filter(Boolean).join(" · ") || null,
        amount: formatTRY(r.amountKurus),
      };
    }
    case "account":
      return {
        primary: t.record.name,
        secondary: ACCOUNT_KIND_LABELS[t.record.kind],
        amount: null,
      };
    case "category":
      return {
        primary: t.record.name,
        secondary: t.record.kind === "income" ? "Gelir" : "Gider",
        amount: null,
      };
    case "rule":
      return {
        primary: t.record.name,
        secondary: FREQ_LABELS[t.record.freq] + (t.record.pausedAt ? " · duraklatıldı" : ""),
        amount: formatTRY(t.record.amountKurus),
      };
    case "debt":
      return {
        primary: t.record.counterparty,
        secondary: `${DIRECTION_LABELS[t.record.direction]} · kalan`,
        amount: formatTRY(t.record.remainingKurus),
      };
  }
}

interface TargetPickerProps {
  /** Radyo grubunun adı — sohbette birden fazla kart olabilir. */
  name: string;
  spec: TargetSpec;
  state: TargetCandidates;
  selected: readonly string[];
  disabled: boolean;
  onToggle: (id: string) => void;
}

export function TargetPicker({ name, spec, state, selected, disabled, onToggle }: TargetPickerProps) {
  const accounts = useAccounts();
  const categories = useCategories();

  if (state.loading) {
    return (
      <p role="status" className="mt-2 text-[13px] text-[var(--ink-3)]">
        Kayıtlar aranıyor…
      </p>
    );
  }

  if (state.problem) {
    return <p className="mt-2 text-[13px] text-[var(--warning)]">{state.problem}</p>;
  }

  const names = {
    category: new Map((categories.data ?? []).map((c) => [c.id, c.name])),
    account: new Map((accounts.data ?? []).map((a) => [a.id, a.name])),
  };

  const legend = spec.multi
    ? "Hangileri? İşaretlediklerin uygulanır."
    : state.candidates.length > 1
      ? "Hangisi? Birini seç."
      : "Bu kayıt mı?";

  return (
    <fieldset className="mt-3" disabled={disabled}>
      <legend className="text-[13px] text-[var(--ink-3)]">{legend}</legend>
      {/*
        Liste kaydırılabilir ama tavanlı (MAX_BATCH): daha fazlası
        `candidateProblem` ile zaten reddediliyor.
      */}
      <ul className="mt-1.5 flex max-h-56 flex-col gap-1 overflow-y-auto">
        {state.candidates.map((t) => {
          const d = describe(t, names);
          const checked = selected.includes(t.id);
          return (
            <li key={t.id}>
              <label
                className={[
                  "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--r-md)] border px-2.5 py-1.5",
                  "transition-colors duration-[var(--dur-fast)]",
                  checked
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]",
                ].join(" ")}
              >
                <input
                  type={spec.multi ? "checkbox" : "radio"}
                  name={name}
                  checked={checked}
                  onChange={() => onToggle(t.id)}
                  className="size-4 shrink-0 accent-[var(--brand)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--ink)]">{d.primary}</span>
                  {d.secondary && (
                    <span className="block truncate text-[12px] text-[var(--ink-3)]">
                      {d.secondary}
                    </span>
                  )}
                </span>
                {d.amount && (
                  <span className="tnum shrink-0 text-sm font-medium text-[var(--ink)]">
                    {d.amount}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
