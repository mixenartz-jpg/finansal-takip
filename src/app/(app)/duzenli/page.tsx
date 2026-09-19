"use client";

import { useState } from "react";
import {
  useRecurringRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useToggleRulePause,
} from "@/features/recurring/queries";
import { RuleForm } from "@/features/recurring/RuleForm";
import { DueBanner } from "@/features/recurring/DueBanner";
import { describeSchedule, nextOccurrence } from "@/features/recurring/occurrence";
import type { RecurringRule } from "@/features/recurring/types";
import { useAccounts } from "@/features/accounts/queries";
import { useCategories } from "@/features/categories/queries";
import { formatTRYCompact } from "@/lib/money/money";
import { formatLongDate } from "@/lib/ui/tr";
import { todayStr } from "@/lib/date/date";
import { Button, Card, EmptyState, Skeleton, Badge } from "@/components/ui";

export default function DuzenliPage() {
  const [editing, setEditing] = useState<RecurringRule | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const rules = useRecurringRules();
  const accounts = useAccounts();
  const categories = useCategories();
  const create = useCreateRule();
  const update = useUpdateRule();
  const remove = useDeleteRule();
  const togglePause = useToggleRulePause();

  const today = todayStr();
  const saving = create.isPending || update.isPending;

  function handleSave(input: Parameters<typeof create.mutate>[0]) {
    if (editing === "new" || editing === null) {
      create.mutate(input, { onSuccess: () => setEditing(null) });
    } else {
      update.mutate(
        { id: editing.id, input },
        { onSuccess: () => setEditing(null) },
      );
    }
  }

  function handleDelete(id: string) {
    // İki adımlı onay: silme geri alınamaz ve şablona bağlı geçmiş
    // işlemlerin izi kopar.
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      window.setTimeout(() => setConfirmDelete(null), 4000);
      return;
    }
    remove.mutate(id, { onSuccess: () => setConfirmDelete(null) });
  }

  if (editing !== null) {
    return (
      <div className="flex flex-col gap-4">
        <h1>{editing === "new" ? "Düzenli işlem ekle" : "Düzenli işlemi düzenle"}</h1>
        <Card className="p-4">
          <RuleForm
            categories={categories.data ?? []}
            accounts={accounts.data ?? []}
            existing={editing === "new" ? undefined : editing}
            saving={saving}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
          {(create.error || update.error) && (
            <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
              {(create.error ?? update.error)?.message}
            </p>
          )}
        </Card>
      </div>
    );
  }

  const items = rules.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1>Düzenli işlemler</h1>
        {items.length > 0 && (
          <Button variant="secondary" onClick={() => setEditing("new")}>
            Ekle
          </Button>
        )}
      </div>

      <DueBanner />

      {rules.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Düzenli işlem yok"
          description="Kira, maaş, abonelik gibi her ay tekrar eden işlemleri tanımlayın. Vakti gelince onayınıza sunulur — otomatik kaydedilmez."
          action={
            <Button variant="primary" onClick={() => setEditing("new")}>
              Düzenli işlem ekle
            </Button>
          }
        />
      ) : (
        <Card className="divide-y divide-[var(--border)]">
          {items.map((rule) => {
            const next = nextOccurrence(rule, rule.lastRunDate);
            const paused = Boolean(rule.pausedAt);
            return (
              <div key={rule.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                <button
                  type="button"
                  onClick={() => setEditing(rule)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-[var(--ink)]">{rule.name}</span>
                    {paused && <Badge tone="neutral">Duraklatıldı</Badge>}
                  </div>
                  <p className="text-[13px] text-[var(--ink-3)]">
                    {describeSchedule(rule)}
                    {next && !paused && ` · sonraki ${formatLongDate(next, today)}`}
                    {!next && !paused && " · bitti"}
                  </p>
                </button>

                <p
                  className={`tnum shrink-0 text-sm font-medium ${
                    rule.kind === "income"
                      ? "text-[var(--income)]"
                      : "text-[var(--expense)]"
                  } ${paused ? "opacity-50" : ""}`}
                >
                  {rule.kind === "income" ? "+" : "−"}
                  {formatTRYCompact(rule.amountKurus)}
                </p>

                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      togglePause.mutate({ id: rule.id, paused: !paused })
                    }
                  >
                    {paused ? "Devam" : "Duraklat"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleDelete(rule.id)}
                    className={confirmDelete === rule.id ? "text-[var(--danger)]" : ""}
                  >
                    {confirmDelete === rule.id ? "Emin misiniz?" : "Sil"}
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {(remove.error || togglePause.error || rules.error) && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {(remove.error ?? togglePause.error ?? rules.error)?.message}
        </p>
      )}
    </div>
  );
}
