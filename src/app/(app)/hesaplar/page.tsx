"use client";

import { useState } from "react";
import {
  useAccountsWithBalances,
  useUpdateAccount,
} from "@/features/accounts/queries";
import { formatTRYCompact } from "@/lib/money/money";
import {
  ACCOUNT_KIND_LABELS,
  type Account,
  type AccountInput,
} from "@/features/accounts/types";
import { AccountEditForm } from "@/features/accounts/AccountEditForm";
import { EmptyState, Skeleton } from "@/components/ui";

export default function HesaplarPage() {
  const accounts = useAccountsWithBalances();
  const updateAccount = useUpdateAccount();
  const [editing, setEditing] = useState<Account | null>(null);

  function handleSave(input: AccountInput) {
    if (!editing) return;
    updateAccount.mutate(
      { id: editing.id, input },
      { onSuccess: () => setEditing(null) },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1>Hesaplar</h1>

      {accounts.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : accounts.data.length === 0 ? (
        <EmptyState
          title="Hesap yok"
          description="Kayıt olurken bir Nakit hesabı oluşturulur. Görünmüyorsa sayfayı yenileyin."
        />
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-[var(--r-lg)] border border-[var(--border)]">
          {accounts.data.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--ink)]">{a.name}</p>
                <p className="text-[13px] text-[var(--ink-3)]">
                  {ACCOUNT_KIND_LABELS[a.kind]}
                </p>
              </div>
              <p
                className={`tnum shrink-0 text-sm font-medium ${
                  a.balanceKurus < 0 ? "text-[var(--expense)]" : "text-[var(--ink)]"
                }`}
              >
                {formatTRYCompact(a.balanceKurus)}
              </p>
              <button
                type="button"
                onClick={() => setEditing(a)}
                aria-label={`Hesabı düzenle: ${a.name}`}
                className="grid size-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--ink-3)] transition-colors hover:text-[var(--brand)]"
              >
                <PencilGlyph />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 z-(--z-sheet)">
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setEditing(null)}
            className="absolute inset-0 bg-[var(--ink)]/20"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Hesabı düzenle"
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-3xl overflow-y-auto rounded-t-[var(--r-lg)] border-t border-[var(--border)] bg-[var(--bg)] p-4 sm:inset-x-4 sm:bottom-4 sm:rounded-[var(--r-lg)] sm:border"
          >
            <AccountEditForm
              account={editing}
              saving={updateAccount.isPending}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
            {updateAccount.error && (
              <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
                {updateAccount.error.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PencilGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
