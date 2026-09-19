"use client";

import { useState } from "react";
import { useTransactionsRange } from "@/features/transactions/queries";
import { useCategories } from "@/features/categories/queries";
import { useAccounts } from "@/features/accounts/queries";
import {
  monthlySummary,
  categoryBreakdown,
  dailyCashflow,
  cumulativeBalance,
} from "@/features/reports/aggregate";
import { buildTransactionCsv, csvFileName } from "@/features/reports/csv";
import { CategoryChart } from "@/features/reports/CategoryChart";
import { CashflowChart } from "@/features/reports/CashflowChart";
import { formatTRYCompact } from "@/lib/money/money";
import { asKurus } from "@/lib/money/money";
import { startOfMonth, endOfMonth, todayStr, addMonths } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";
import { formatMonthTitle } from "@/lib/ui/tr";
import { Button, Card, Skeleton } from "@/components/ui";

type Tab = "expense" | "income";

export default function RaporPage() {
  const [month, setMonth] = useState<DateStr>(() => startOfMonth(todayStr()));
  const [tab, setTab] = useState<Tab>("expense");

  const from = month;
  const to = endOfMonth(month);

  const transactions = useTransactionsRange(from, to);
  const categories = useCategories();
  const accounts = useAccounts();

  const items = transactions.data ?? [];
  const summary = monthlySummary(items);

  const categoryNames = new Map(
    (categories.data ?? []).map((c) => [c.id, c.name]),
  );
  const accountNames = new Map((accounts.data ?? []).map((a) => [a.id, a.name]));

  const slices = categoryBreakdown(items, categoryNames, tab);
  const daily = dailyCashflow(items, from, to);
  // Ay başı bakiyesi sıfır kabul edilir: grafik o AYIN akışını
  // gösteriyor, mutlak servet düzeyini değil. Gerçek başlangıç
  // bakiyesini eklemek, ayın kendi hikâyesini görsel olarak düz
  // bir çizgiye indirgerdi (10.000 TL üzerine 200 TL hareket).
  const balancePoints = cumulativeBalance(daily, asKurus(0));

  function handleExport() {
    const csv = buildTransactionCsv(items, accountNames, categoryNames);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName(from, to);
    a.click();

    // ── SERBEST BIRAKMA ERTELENİR ──
    //
    // `a.click()` indirmeyi ASENKRON başlatır. URL'i hemen serbest
    // bırakmak Chromium'da çalışıyor (test edildi) ama Firefox ve
    // Safari'de indirmenin iptal olmasına yol açabilen bilinen bir
    // durum. Bir sonraki olay döngüsüne ertelemek tarayıcıya URL'i
    // okuma fırsatı verir; sızıntı yine önlenir çünkü serbest
    // bırakma yine de çalışır.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const loading = transactions.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1>Rapor</h1>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {/* ── Ay özeti ── */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile
          label="Gelir"
          value={formatTRYCompact(summary.incomeKurus)}
          tone="income"
          loading={loading}
        />
        <SummaryTile
          label="Gider"
          value={formatTRYCompact(summary.expenseKurus)}
          tone="expense"
          loading={loading}
        />
        <SummaryTile
          label="Fark"
          value={formatTRYCompact(summary.netKurus)}
          tone={summary.netKurus < 0 ? "expense" : "income"}
          loading={loading}
        />
      </div>

      {/* ── Nakit akışı ── */}
      <section aria-labelledby="akis-baslik">
        <h2 id="akis-baslik" className="mb-2 text-[13px] font-medium text-[var(--ink-3)]">
          Ay içi değişim
        </h2>
        <Card className="px-3 py-3">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <CashflowChart points={balancePoints} />
          )}
        </Card>
      </section>

      {/* ── Kategori dağılımı ── */}
      <section aria-labelledby="kategori-baslik">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2
            id="kategori-baslik"
            className="text-[13px] font-medium text-[var(--ink-3)]"
          >
            Kategori dağılımı
          </h2>
          <div className="flex gap-1">
            <TabButton active={tab === "expense"} onClick={() => setTab("expense")}>
              Gider
            </TabButton>
            <TabButton active={tab === "income"} onClick={() => setTab("income")}>
              Gelir
            </TabButton>
          </div>
        </div>
        <Card className="px-3 py-3">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <CategoryChart slices={slices} />
          )}
        </Card>
      </section>

      {/* ── Dışa aktarma ── */}
      <section className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={handleExport}
          disabled={loading || items.length === 0}
        >
          CSV indir
        </Button>
        <span className="text-[13px] text-[var(--ink-3)]">
          {loading
            ? "Yükleniyor…"
            : `${summary.transactionCount} işlem · Excel uyumlu`}
        </span>
      </section>

      {transactions.error && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {transactions.error.message}
        </p>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: string;
  tone: "income" | "expense";
  loading: boolean;
}) {
  const color = tone === "income" ? "text-[var(--income)]" : "text-[var(--expense)]";
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] px-3 py-2.5">
      <p className="text-[13px] text-[var(--ink-3)]">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-20" />
      ) : (
        <p className={`tnum text-[1.0625rem] font-semibold ${color}`}>{value}</p>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-[var(--r-md)] px-2.5 py-1 text-[13px] font-medium",
        "transition-colors duration-[var(--dur-fast)]",
        active
          ? "bg-[var(--brand-soft)] text-[var(--brand-ink)]"
          : "text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function MonthNav({
  month,
  onChange,
}: {
  month: DateStr;
  onChange: (m: DateStr) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        onClick={() => onChange(addMonths(month, -1))}
        aria-label="Önceki ay"
      >
        ‹
      </Button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium text-[var(--ink)]">
        {formatMonthTitle(month)}
      </span>
      <Button
        variant="ghost"
        onClick={() => onChange(addMonths(month, 1))}
        aria-label="Sonraki ay"
      >
        ›
      </Button>
    </div>
  );
}
