"use client";

import { useAccountsWithBalances } from "@/features/accounts/queries";
import { formatTRYCompact } from "@/lib/money/money";
import { ACCOUNT_KIND_LABELS } from "@/features/accounts/types";
import { EmptyState, Skeleton } from "@/components/ui";

export default function HesaplarPage() {
  const accounts = useAccountsWithBalances();

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
            <li key={a.id} className="flex items-center justify-between px-3 py-3">
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
    </div>
  );
}
