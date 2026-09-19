"use client";

import { useAccountsWithBalances } from "@/features/accounts/queries";
import { useCategories } from "@/features/categories/queries";
import { useRecentTransactions } from "@/features/transactions/queries";
import { TransactionList } from "@/features/transactions/TransactionList";
import { formatTRYCompact } from "@/lib/money/money";
import { sumKurus, asKurus } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import { startOfMonth, todayStr } from "@/lib/date/date";
import { useBudgetProgress } from "@/features/budgets/queries";
import { summarizeBudgets } from "@/features/budgets/progress";
import { DueBanner } from "@/features/recurring/DueBanner";
import Link from "next/link";
import { formatMonthTitle } from "@/lib/ui/tr";
import { Skeleton } from "@/components/ui";
import { ACCOUNT_KIND_LABELS } from "@/features/accounts/types";

/**
 * Panel — "durumum ne" sorusunun tek ekranlık cevabı.
 *
 * ── HERO-METRİK ŞABLONUNDAN KAÇINMA ──
 *
 * SaaS klişesi: dev bir sayı, altında küçük etiket, yanında gradyan
 * vurgu. Burada bilgi hiyerarşisi gerçek önem sırasına göre: toplam
 * varlık en üstte ve en büyük, ay özeti onun altında, hesap dağılımı
 * ve son işlemler sonra. Ölçek farkı dekoratif değil, anlamlı.
 */
export default function PanelPage() {
  const accounts = useAccountsWithBalances();
  const categories = useCategories();
  const transactions = useRecentTransactions(20);

  const today = todayStr();
  const monthStart = startOfMonth(today);
  const budgets = useBudgetProgress(monthStart);
  const budgetSummary = summarizeBudgets(budgets.data ?? []);

  const totalBalance = accounts.data.length
    ? sumKurus(accounts.data.map((a) => a.balanceKurus))
    : asKurus(0);

  // Ay içi gelir/gider. Transferler HARİÇ: kendi hesapları arasında
  // para taşımak ne gelir ne giderdir; dahil edilseydi özet şişerdi.
  const monthTx = (transactions.data ?? []).filter((t) => t.date >= monthStart);
  const monthIncome = sumKurus(
    monthTx.filter((t) => t.kind === "income").map((t) => t.amountKurus),
  );
  const monthExpense = sumKurus(
    monthTx.filter((t) => t.kind === "expense").map((t) => t.amountKurus),
  );

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="toplam-baslik">
        <h1 id="toplam-baslik" className="text-[13px] font-medium text-[var(--ink-3)]">
          Toplam varlık
        </h1>
        {accounts.isPending ? (
          <Skeleton className="mt-1 h-9 w-48" />
        ) : (
          <p className="tnum mt-0.5 text-[2rem] font-semibold leading-tight text-[var(--ink)]">
            {formatTRYCompact(totalBalance)}
          </p>
        )}
      </section>

      {/* Vadesi gelen düzenli işlemler — bütçe uyarısının ÜSTÜNDE:
          vade bir EYLEM ister (onayla/atla), bütçe uyarısı yalnızca
          bilgidir. Eylem isteyen önce görünür. */}
      <DueBanner />

      {/* ── Bütçe uyarısı ──
          Bütçe bir hedeftir, harcamayı ENGELLEMEZ (ürün kararı).
          Aşım burada görünür olur; kullanıcı bütçe sayfasına girmeden
          "bu ay sınırı aştım mı" sorusunun cevabını alır. */}
      {budgetSummary.overCount > 0 && (
        <Link
          href="/butce"
          className="block rounded-[var(--r-lg)] bg-[var(--expense-soft)] px-3 py-2.5 transition-opacity hover:opacity-80"
        >
          <p className="text-sm font-medium text-[var(--expense)]">
            {budgetSummary.overCount === 1
              ? "1 kategoride bütçe aşıldı"
              : `${budgetSummary.overCount} kategoride bütçe aşıldı`}
          </p>
          <p className="tnum text-[13px] text-[var(--expense)]">
            Toplam {formatTRYCompact(budgetSummary.totalOverspendKurus)} aşım
          </p>
        </Link>
      )}

      {budgetSummary.overCount === 0 && budgetSummary.warningCount > 0 && (
        <Link
          href="/butce"
          className="block rounded-[var(--r-lg)] bg-[var(--warning-soft)] px-3 py-2.5 transition-opacity hover:opacity-80"
        >
          <p className="text-sm font-medium text-[var(--warning)]">
            {budgetSummary.warningCount === 1
              ? "1 kategori bütçe limitine yaklaştı"
              : `${budgetSummary.warningCount} kategori bütçe limitine yaklaştı`}
          </p>
        </Link>
      )}

      <section aria-labelledby="ay-baslik">
        <h2 id="ay-baslik" className="mb-2 text-[13px] font-medium text-[var(--ink-3)]">
          {formatMonthTitle(today)}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <SummaryTile
            label="Gelir"
            value={monthIncome}
            tone="income"
            loading={transactions.isPending}
          />
          <SummaryTile
            label="Gider"
            value={monthExpense}
            tone="expense"
            loading={transactions.isPending}
          />
        </div>
      </section>

      <section aria-labelledby="hesaplar-baslik">
        <h2 id="hesaplar-baslik" className="mb-2 text-[13px] font-medium text-[var(--ink-3)]">
          Hesaplar
        </h2>
        {accounts.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-[var(--r-lg)] border border-[var(--border)]">
            {accounts.data.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <p className="text-sm text-[var(--ink)]">{a.name}</p>
                  <p className="text-[13px] text-[var(--ink-3)]">
                    {ACCOUNT_KIND_LABELS[a.kind]}
                  </p>
                </div>
                <p
                  className={`tnum text-sm font-medium ${
                    a.balanceKurus < 0 ? "text-[var(--expense)]" : "text-[var(--ink)]"
                  }`}
                >
                  {formatTRYCompact(a.balanceKurus)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="son-baslik">
        <h2 id="son-baslik" className="mb-2 text-[13px] font-medium text-[var(--ink-3)]">
          Son işlemler
        </h2>
        <TransactionList
          transactions={transactions.data ?? []}
          categories={categories.data ?? []}
          accounts={accounts.data}
          loading={transactions.isPending}
        />
      </section>
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
  value: Kurus;
  tone: "income" | "expense";
  loading: boolean;
}) {
  const color = tone === "income" ? "text-[var(--income)]" : "text-[var(--expense)]";
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] px-3 py-2.5">
      <p className="text-[13px] text-[var(--ink-3)]">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-24" />
      ) : (
        <p className={`tnum text-[1.0625rem] font-semibold ${color}`}>
          {formatTRYCompact(value)}
        </p>
      )}
    </div>
  );
}
