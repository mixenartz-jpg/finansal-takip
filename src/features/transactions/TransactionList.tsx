"use client";

import { formatTRYSigned } from "@/lib/money/money";
import { formatLongDate } from "@/lib/ui/tr";
import type { DateStr } from "@/lib/date/types";
import type { Transaction } from "./types";
import type { Category } from "@/features/categories/types";
import type { Account } from "@/features/accounts/types";
import { EmptyState, Skeleton } from "@/components/ui";

/**
 * İşlem listesi — güne göre gruplanmış.
 *
 * ── NEDEN GRUPLAMA ──
 *
 * Düz bir liste tarihleri her satırda tekrarlar ve göz aynı bilgiyi
 * defalarca okur. Gün başlığı altında toplamak hem tekrarı kaldırır
 * hem de "o gün ne harcadım" sorusunu kendiliğinden cevaplar.
 *
 * ── TABULAR RAKAMLAR ──
 *
 * Tutar sütunu `.tnum` taşır. Orantılı rakamlarla "1.111" ve "8.888"
 * farklı genişlikte çizilir, sütun kayar ve göz listeyi tarayamaz.
 */

interface TransactionListProps {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  accounts: readonly Account[];
  loading?: boolean;
  onDelete?: (id: string) => void;
}

export function TransactionList({
  transactions,
  categories,
  accounts,
  loading,
  onDelete,
}: TransactionListProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <EmptyState
        title="Henüz işlem yok"
        description="Sağ alttaki mikrofona dokunup “200 tl yemek aldım” gibi söyleyerek ilk işleminizi ekleyebilirsiniz."
      />
    );
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const groups = groupByDate(transactions);

  return (
    <div className="flex flex-col gap-5">
      {groups.map(([date, items]) => (
        <section key={date}>
          <h2 className="mb-2 text-[13px] font-medium text-[var(--ink-3)]">
            {formatLongDate(date)}
          </h2>
          <ul className="flex flex-col divide-y divide-[var(--border)] rounded-[var(--r-lg)] border border-[var(--border)]">
            {items.map((tx) => (
              <li key={tx.id}>
                <TransactionRow
                  tx={tx}
                  category={tx.categoryId ? categoryById.get(tx.categoryId) : undefined}
                  account={accountById.get(tx.accountId)}
                  counterAccount={
                    tx.counterAccountId ? accountById.get(tx.counterAccountId) : undefined
                  }
                  onDelete={onDelete}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TransactionRow({
  tx,
  category,
  account,
  counterAccount,
  onDelete,
}: {
  tx: Transaction;
  category?: Category;
  account?: Account;
  counterAccount?: Account;
  onDelete?: (id: string) => void;
}) {
  const label =
    tx.kind === "transfer"
      ? `${account?.name ?? "?"} → ${counterAccount?.name ?? "?"}`
      : (category?.name ?? "Kategorisiz");

  const amountColor =
    tx.kind === "income"
      ? "text-[var(--income)]"
      : tx.kind === "expense"
        ? "text-[var(--expense)]"
        : "text-[var(--ink-2)]";

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm text-[var(--ink)]">{label}</p>
          {tx.source === "voice" && (
            /*
             * ── NEDEN `aria-label` DEĞİL ──
             *
             * `aria-label` yalnızca anlamsal rolü olan öğelerde
             * geçerlidir; düz bir `<span>` üzerinde ekran okuyucu
             * onu YOK SAYAR ve ikonun anlamı kaybolur (axe:
             * aria-prohibited-attr).
             *
             * `title` de yeterli değil: klavye ve dokunmatikte
             * görünmez. Bunun yerine görsel olarak gizli ama
             * okunabilir gerçek metin kullanılıyor.
             */
            <span
              title={tx.voiceTranscript ?? "Sesle eklendi"}
              className="shrink-0 text-[var(--ink-3)]"
            >
              <MicGlyph />
              <span className="sr-only">
                Sesle eklendi
                {tx.voiceTranscript ? `: ${tx.voiceTranscript}` : ""}
              </span>
            </span>
          )}
        </div>
        {tx.note && (
          <p className="truncate text-[13px] text-[var(--ink-3)]">{tx.note}</p>
        )}
      </div>

      <p className={`tnum shrink-0 text-sm font-medium ${amountColor}`}>
        {formatTRYSigned(tx.amountKurus, tx.kind)}
      </p>

      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(tx.id)}
          aria-label="İşlemi sil"
          /* `size-7` (28px): WCAG 2.2 (2.5.8) en az 24×24 CSS px
             ister. `p-1` + 15px ikon 23×23 veriyordu — bir piksel
             eksikti ve dokunmatikte ıskalanması kolaydı. */
          className="grid size-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--ink-3)] opacity-0 transition-opacity hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <TrashGlyph />
        </button>
      )}
    </div>
  );
}

/** Tarihe göre gruplar; işlemler zaten tarihe göre sıralı gelir. */
function groupByDate(
  transactions: readonly Transaction[],
): [DateStr, Transaction[]][] {
  const map = new Map<DateStr, Transaction[]>();
  for (const tx of transactions) {
    const list = map.get(tx.date);
    if (list) list.push(tx);
    else map.set(tx.date, [tx]);
  }
  return [...map.entries()];
}

function MicGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
