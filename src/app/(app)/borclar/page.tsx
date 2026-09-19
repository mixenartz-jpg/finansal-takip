"use client";

import { useState } from "react";
import {
  useDebtBalances,
  useDebtPayments,
  useCreateDebt,
  useUpdateDebt,
  useDeleteDebt,
  useAddPayment,
  useDeletePayment,
} from "@/features/debts/queries";
import { DebtCard } from "@/features/debts/DebtCard";
import { DebtForm } from "@/features/debts/DebtForm";
import { PaymentForm } from "@/features/debts/PaymentForm";
import { debtStatus, summarizeDebts } from "@/features/debts/remaining";
import type { DebtBalance, PaymentInput } from "@/features/debts/types";
import { useAccounts } from "@/features/accounts/queries";
import { formatTRYCompact } from "@/lib/money/money";
import { formatLongDate } from "@/lib/ui/tr";
import { todayStr } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";
import { Button, Card, EmptyState, Skeleton } from "@/components/ui";

type View =
  | { mode: "list" }
  | { mode: "new" }
  | { mode: "edit"; debt: DebtBalance }
  | { mode: "detail"; debt: DebtBalance }
  | { mode: "pay"; debt: DebtBalance };

export default function BorclarPage() {
  const [view, setView] = useState<View>({ mode: "list" });

  const debts = useDebtBalances();
  const accounts = useAccounts();
  const create = useCreateDebt();
  const update = useUpdateDebt();
  const remove = useDeleteDebt();
  const addPayment = useAddPayment();

  const today = todayStr();
  const items = debts.data ?? [];
  const summary = summarizeDebts(items, today);

  // Açık borçlar önce, kapananlar sonra: kapanmış kayıtlar geçmiş
  // bilgisidir, güncel durumu bastırmamalı.
  const sorted = [...items].sort((a, b) => {
    const aClosed = debtStatus(a) === "closed" ? 1 : 0;
    const bClosed = debtStatus(b) === "closed" ? 1 : 0;
    return aClosed - bClosed;
  });

  function handleSave(input: Parameters<typeof create.mutate>[0]) {
    if (view.mode === "edit") {
      update.mutate(
        { id: view.debt.debtId, input },
        { onSuccess: () => setView({ mode: "list" }) },
      );
    } else {
      create.mutate(input, { onSuccess: () => setView({ mode: "list" }) });
    }
  }

  function handlePayment(input: PaymentInput) {
    if (view.mode !== "pay") return;
    addPayment.mutate(
      {
        input,
        direction: view.debt.direction,
        counterparty: view.debt.counterparty,
      },
      { onSuccess: () => setView({ mode: "list" }) },
    );
  }

  // ── Form görünümleri ──
  if (view.mode === "new" || view.mode === "edit") {
    return (
      <div className="flex flex-col gap-4">
        <h1>{view.mode === "new" ? "Borç / alacak ekle" : "Düzenle"}</h1>
        <Card className="p-4">
          <DebtForm
            existing={view.mode === "edit" ? view.debt : undefined}
            saving={create.isPending || update.isPending || remove.isPending}
            onSave={handleSave}
            onDelete={
              view.mode === "edit"
                ? () =>
                    remove.mutate(view.debt.debtId, {
                      onSuccess: () => setView({ mode: "list" }),
                    })
                : undefined
            }
            onCancel={() => setView({ mode: "list" })}
          />
          {(create.error || update.error || remove.error) && (
            <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
              {(create.error ?? update.error ?? remove.error)?.message}
            </p>
          )}
        </Card>
      </div>
    );
  }

  if (view.mode === "pay") {
    return (
      <div className="flex flex-col gap-4">
        <h1>Ödeme ekle</h1>
        <Card className="p-4">
          <PaymentForm
            debt={view.debt}
            accounts={accounts.data ?? []}
            saving={addPayment.isPending}
            onSave={handlePayment}
            onCancel={() => setView({ mode: "detail", debt: view.debt })}
          />
          {addPayment.error && (
            <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
              {addPayment.error.message}
            </p>
          )}
        </Card>
      </div>
    );
  }

  if (view.mode === "detail") {
    return (
      <DebtDetail
        debt={view.debt}
        today={today}
        onPay={() => setView({ mode: "pay", debt: view.debt })}
        onEdit={() => setView({ mode: "edit", debt: view.debt })}
        onBack={() => setView({ mode: "list" })}
      />
    );
  }

  // ── Liste görünümü ──
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1>Borç / alacak</h1>
        {items.length > 0 && (
          <Button variant="secondary" onClick={() => setView({ mode: "new" })}>
            Ekle
          </Button>
        )}
      </div>

      {!debts.isPending && summary.openCount > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <SummaryTile
            label="Borcum"
            value={formatTRYCompact(summary.payableRemainingKurus)}
          />
          <SummaryTile
            label="Alacağım"
            value={formatTRYCompact(summary.receivableRemainingKurus)}
          />
        </div>
      )}

      {summary.overdueCount > 0 && (
        <p className="rounded-[var(--r-md)] bg-[var(--expense-soft)] px-3 py-2 text-[13px] text-[var(--expense)]">
          {summary.overdueCount === 1
            ? "1 kaydın vadesi geçti"
            : `${summary.overdueCount} kaydın vadesi geçti`}
        </p>
      )}

      {debts.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Borç veya alacak yok"
          description="Kime borçlu olduğunuzu, kimin size borçlu olduğunu ve ne kadarının ödendiğini buradan takip edin."
          action={
            <Button variant="primary" onClick={() => setView({ mode: "new" })}>
              Borç / alacak ekle
            </Button>
          }
        />
      ) : (
        <Card className="divide-y divide-[var(--border)]">
          {sorted.map((d) => (
            <DebtCard
              key={d.debtId}
              debt={d}
              today={today}
              onClick={() => setView({ mode: "detail", debt: d })}
            />
          ))}
        </Card>
      )}

      {debts.error && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {debts.error.message}
        </p>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] px-3 py-2.5">
      <p className="text-[13px] text-[var(--ink-3)]">{label}</p>
      <p className="tnum text-[1.0625rem] font-semibold text-[var(--ink)]">{value}</p>
    </div>
  );
}

/** Borç ayrıntısı: özet + ödeme geçmişi. */
function DebtDetail({
  debt,
  today,
  onPay,
  onEdit,
  onBack,
}: {
  debt: DebtBalance;
  today: DateStr;
  onPay: () => void;
  onEdit: () => void;
  onBack: () => void;
}) {
  const payments = useDebtPayments(debt.debtId);
  const removePayment = useDeletePayment();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const isClosed = debtStatus(debt) === "closed";

  function handleDelete(id: string) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      window.setTimeout(() => setConfirmDelete(null), 4000);
      return;
    }
    removePayment.mutate(id, { onSuccess: () => setConfirmDelete(null) });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          ‹ Geri
        </Button>
        <Button variant="ghost" onClick={onEdit}>
          Düzenle
        </Button>
      </div>

      <Card className="p-4">
        <DebtCard debt={debt} today={today} />
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-3">
          <Stat label="Anapara" value={formatTRYCompact(debt.principalKurus)} />
          <Stat label="Ödenen" value={formatTRYCompact(debt.paidKurus)} />
          <Stat label="Kalan" value={formatTRYCompact(debt.remainingKurus)} />
        </div>
      </Card>

      {!isClosed && (
        <Button variant="primary" onClick={onPay} full>
          Ödeme ekle
        </Button>
      )}

      <section>
        <h2 className="mb-2 text-[13px] font-medium text-[var(--ink-3)]">
          Ödemeler
        </h2>
        {payments.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : (payments.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--ink-3)]">Henüz ödeme yok.</p>
        ) : (
          <Card className="divide-y divide-[var(--border)]">
            {(payments.data ?? []).map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--ink)]">
                    {formatLongDate(p.date, today)}
                  </p>
                  {p.note && (
                    <p className="truncate text-[13px] text-[var(--ink-3)]">
                      {p.note}
                    </p>
                  )}
                  {p.transactionId && (
                    <p className="text-[13px] text-[var(--ink-3)]">
                      Hesaba işlendi
                    </p>
                  )}
                </div>
                <p className="tnum shrink-0 text-sm font-medium text-[var(--ink)]">
                  {formatTRYCompact(p.amountKurus)}
                </p>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  className={`shrink-0 rounded-[var(--r-sm)] px-1.5 py-1 text-[13px] transition-opacity ${
                    confirmDelete === p.id
                      ? "text-[var(--danger)] opacity-100"
                      : "text-[var(--ink-3)] opacity-0 hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
                  }`}
                >
                  {confirmDelete === p.id ? "Emin misiniz?" : "Sil"}
                </button>
              </div>
            ))}
          </Card>
        )}

        {removePayment.error && (
          <p role="alert" className="mt-2 text-[13px] text-[var(--danger)]">
            {removePayment.error.message}
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[13px] text-[var(--ink-3)]">{label}</p>
      <p className="tnum text-sm font-medium text-[var(--ink)]">{value}</p>
    </div>
  );
}
