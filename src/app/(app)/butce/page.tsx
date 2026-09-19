"use client";

import { useState } from "react";
import {
  useBudgetProgress,
  useUpsertBudget,
  useDeleteBudget,
  useCopyPreviousMonth,
} from "@/features/budgets/queries";
import { BudgetBar } from "@/features/budgets/BudgetBar";
import { BudgetForm } from "@/features/budgets/BudgetForm";
import { summarizeBudgets } from "@/features/budgets/progress";
import type { BudgetProgress } from "@/features/budgets/types";
import { useCategories } from "@/features/categories/queries";
import { formatTRYCompact } from "@/lib/money/money";
import { startOfMonth, todayStr, addMonths } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";
import { formatMonthTitle } from "@/lib/ui/tr";
import { Button, Card, EmptyState, Skeleton } from "@/components/ui";

export default function ButcePage() {
  const [month, setMonth] = useState<DateStr>(() => startOfMonth(todayStr()));
  const [editing, setEditing] = useState<BudgetProgress | "new" | null>(null);

  const categories = useCategories();
  const progress = useBudgetProgress(month);
  const upsert = useUpsertBudget();
  const remove = useDeleteBudget();
  const copyPrevious = useCopyPreviousMonth();

  const expenseCategories = (categories.data ?? []).filter(
    (c) => c.kind === "expense",
  );
  const categoryById = new Map(expenseCategories.map((c) => [c.id, c]));
  const items = progress.data ?? [];
  const summary = summarizeBudgets(items);

  const previousMonth = addMonths(month, -1);

  function handleSave(input: Parameters<typeof upsert.mutate>[0]) {
    upsert.mutate(input, { onSuccess: () => setEditing(null) });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1>Bütçe</h1>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {/* Ay özeti — bütçe sayfasının tek satırlık cevabı. */}
      {!progress.isPending && items.length > 0 && (
        <Card className="px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-[var(--ink-3)]">Toplam</span>
            <span className="tnum text-sm text-[var(--ink)]">
              {formatTRYCompact(summary.totalSpentKurus)}
              {" / "}
              {formatTRYCompact(summary.totalLimitKurus)}
            </span>
          </div>
          {summary.overCount > 0 && (
            <p className="tnum mt-1 text-[13px] text-[var(--expense)]">
              {summary.overCount} kategoride toplam{" "}
              {formatTRYCompact(summary.totalOverspendKurus)} aşım
            </p>
          )}
          {summary.overCount === 0 && summary.warningCount > 0 && (
            <p className="mt-1 text-[13px] text-[var(--warning)]">
              {summary.warningCount} kategori limite yaklaştı
            </p>
          )}
        </Card>
      )}

      {editing !== null ? (
        <Card className="p-4">
          <h2 className="mb-3">
            {editing === "new" ? "Bütçe ekle" : "Bütçeyi düzenle"}
          </h2>
          <BudgetForm
            categories={expenseCategories}
            month={month}
            existing={editing === "new" ? undefined : editing}
            usedCategoryIds={items.map((i) => i.categoryId)}
            saving={upsert.isPending || remove.isPending}
            onSave={handleSave}
            onDelete={
              editing === "new"
                ? undefined
                : () =>
                    remove.mutate(editing.budgetId, {
                      onSuccess: () => setEditing(null),
                    })
            }
            onCancel={() => setEditing(null)}
          />
          {(upsert.error || remove.error) && (
            <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
              {(upsert.error ?? remove.error)?.message}
            </p>
          )}
        </Card>
      ) : (
        <>
          {progress.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : items.length === 0 ? (
            <EmptyState
              title={`${formatMonthTitle(month)} için bütçe yok`}
              description="Bir kategoriye aylık limit koyun; harcadıkça ne kadar kaldığını görün. Bütçe bir hedeftir, harcamayı engellemez."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" onClick={() => setEditing("new")}>
                    Bütçe ekle
                  </Button>
                  <Button
                    variant="secondary"
                    loading={copyPrevious.isPending}
                    onClick={() =>
                      copyPrevious.mutate({ from: previousMonth, to: month })
                    }
                  >
                    Geçen aydan kopyala
                  </Button>
                </div>
              }
            />
          ) : (
            <>
              <Card className="divide-y divide-[var(--border)]">
                {items.map((p) => (
                  <BudgetBar
                    key={p.budgetId}
                    progress={p}
                    categoryName={categoryById.get(p.categoryId)?.name ?? "Kategorisiz"}
                    onEdit={() => setEditing(p)}
                  />
                ))}
              </Card>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setEditing("new")}>
                  Bütçe ekle
                </Button>
              </div>
            </>
          )}

          {copyPrevious.error && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {copyPrevious.error.message}
            </p>
          )}
          {/* Kopyalama sonucu: kaç tanesi gerçekten eklendi.
              "Kopyalandı" deyip hiçbir şey eklememek (hepsi zaten
              varsa) kullanıcıyı yanıltırdı. */}
          {copyPrevious.isSuccess && copyPrevious.data && (
            <p role="status" className="text-[13px] text-[var(--ink-3)]">
              {copyPrevious.data.copied > 0
                ? `${copyPrevious.data.copied} bütçe kopyalandı.`
                : "Kopyalanacak yeni bütçe yoktu."}
              {copyPrevious.data.skipped > 0 &&
                ` ${copyPrevious.data.skipped} kategori artık kullanılmadığı için atlandı.`}
            </p>
          )}
          {progress.error && (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              {progress.error.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Ay gezinmesi.
 *
 * Ay aritmetiği `addMonths` ile yapılır (src/lib/date/date.ts):
 * `addDays(-30)` kısa yolu 31 günlük aylarda yanlış aya düşer.
 */
function MonthNav({
  month,
  onChange,
}: {
  month: DateStr;
  onChange: (m: DateStr) => void;
}) {
  const shift = (delta: number) => onChange(addMonths(month, delta));

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" onClick={() => shift(-1)} aria-label="Önceki ay">
        ‹
      </Button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium text-[var(--ink)]">
        {formatMonthTitle(month)}
      </span>
      <Button variant="ghost" onClick={() => shift(1)} aria-label="Sonraki ay">
        ›
      </Button>
    </div>
  );
}
