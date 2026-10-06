"use client";

import { useState } from "react";
import { formatTRYSigned } from "@/lib/money/money";
import { formatLongDate } from "@/lib/ui/tr";
import { todayStr } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";
import { groupByDay, isDayOpen, type DayGroup } from "./grouping";
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
 *
 * ── DARALTILABİLİR GÜNLER ──
 *
 * İşlemler sayfasında liste uzadıkça bugünü bulmak için geçmişin
 * içinden kaydırmak gerekiyordu. `collapsible` verildiğinde her gün
 * bir kutu: bugün açık, önceki günler kapalı gelir ve başlığında o
 * günün toplamını taşır. Çoğu zaman cevap ("dün ne harcadım") kutuyu
 * açmadan okunur.
 *
 * Panelde (son işlemler) liste zaten kısa; orada günler açık kalır.
 */

interface TransactionListProps {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  accounts: readonly Account[];
  loading?: boolean;
  /** Günler daraltılabilir kutular olsun: bugün açık, geçmiş kapalı. */
  collapsible?: boolean;
  onDelete?: (id: string) => void;
  onEdit?: (tx: Transaction) => void;
}

export function TransactionList({
  transactions,
  categories,
  accounts,
  loading,
  collapsible = false,
  onDelete,
  onEdit,
}: TransactionListProps) {
  /*
   * Yalnızca kullanıcının ELLE değiştirdiği günler tutulur. Varsayılan
   * (bugün açık) her render'da hesaplanır; saklansaydı gece yarısını
   * geçen açık bir sekmede dünün kutusu "bugün" diye açık kalırdı.
   */
  const [overrides, setOverrides] = useState<ReadonlyMap<DateStr, boolean>>(new Map());

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
  const days = groupByDay(transactions);
  const today = todayStr();

  const rows = (items: readonly Transaction[]) =>
    items.map((tx) => (
      <li key={tx.id}>
        <TransactionRow
          tx={tx}
          category={tx.categoryId ? categoryById.get(tx.categoryId) : undefined}
          account={accountById.get(tx.accountId)}
          counterAccount={tx.counterAccountId ? accountById.get(tx.counterAccountId) : undefined}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      </li>
    ));

  if (collapsible) {
    return (
      <div className="flex flex-col gap-2">
        {days.map((day) => {
          const open = isDayOpen(day.date, today, overrides);
          return (
            <DayBox
              key={day.date}
              day={day}
              open={open}
              onToggle={() => setOverrides((prev) => new Map(prev).set(day.date, !open))}
            >
              {rows(day.items)}
            </DayBox>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {days.map((day) => (
        <section key={day.date}>
          <h2 className="mb-2 text-[13px] font-medium text-[var(--ink-3)]">
            {formatLongDate(day.date)}
          </h2>
          <ul className="flex flex-col divide-y divide-[var(--border)] rounded-[var(--r-lg)] border border-[var(--border)]">
            {rows(day.items)}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Daraltılabilir gün kutusu.
 *
 * Başlığın tamamı düğme: dokunma hedefi satır kadar geniş. Toplamlar
 * kutu açıkken de görünür — açmak bilgiyi değiştirmez, ayrıntı ekler.
 *
 * Gider ve gelir yalnızca renkle ayrılmıyor: işaret (− / +) görünür,
 * ekran okuyucu için de adı söyleniyor.
 */
function DayBox({
  day,
  open,
  onToggle,
  children,
}: {
  day: DayGroup;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = `gun-${day.date}`;

  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)]">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className={[
            "flex w-full items-center gap-2 px-3 py-2.5 text-left",
            // Açıkken alt köşeler düz: vurgu, altındaki listeyle
            // arasındaki çizgiye oturur.
            open ? "rounded-t-[var(--r-lg)]" : "rounded-[var(--r-lg)]",
            "hover:bg-[var(--surface-2)]",
            "transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]",
          ].join(" ")}
        >
          <ChevronGlyph open={open} />
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-medium text-[var(--ink)]">
              {formatLongDate(day.date)}
            </span>
            {/* Dar ekranda yer tarihe ve toplamlara kalır; sayı
                ekran okuyucu için yerinde durur. */}
            <span className="shrink-0 text-[13px] text-[var(--ink-3)] max-sm:sr-only">
              {day.items.length} işlem
            </span>
          </span>
          <span className="tnum ml-auto flex shrink-0 items-baseline gap-3 text-sm font-medium">
            {day.incomeKurus > 0 && (
              <span className="text-[var(--income)]">
                <span className="sr-only">gelir </span>
                {formatTRYSigned(day.incomeKurus, "income")}
              </span>
            )}
            {day.expenseKurus > 0 && (
              <span className="text-[var(--expense)]">
                <span className="sr-only">gider </span>
                {formatTRYSigned(day.expenseKurus, "expense")}
              </span>
            )}
          </span>
        </button>
      </h2>

      {open && (
        <ul
          id={panelId}
          className="flex flex-col divide-y divide-[var(--border)] border-t border-[var(--border)]"
        >
          {children}
        </ul>
      )}
    </section>
  );
}

function TransactionRow({
  tx,
  category,
  account,
  counterAccount,
  onDelete,
  onEdit,
}: {
  tx: Transaction;
  category?: Category;
  account?: Account;
  counterAccount?: Account;
  onDelete?: (id: string) => void;
  onEdit?: (tx: Transaction) => void;
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
             * `title` de kullanılmıyor: klavye ve dokunmatikte
             * görünmez, ÜSTELİK aynı metni hem `title` hem gizli
             * metin olarak vermek bazı ekran okuyucularda çift
             * okumaya yol açar. Tek kaynak: görsel olarak gizli
             * ama gerçek metin.
             */
            <span className="shrink-0 text-[var(--ink-3)]">
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

      {onEdit && (
        <button
          type="button"
          onClick={() => onEdit(tx)}
          aria-label={`İşlemi düzenle: ${label}`}
          className="grid size-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--ink-3)] opacity-0 transition-opacity hover:text-[var(--brand)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <PencilGlyph />
        </button>
      )}

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

/** Kapalıyken sağa, açıkken aşağı bakar. */
function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={[
        "shrink-0 text-[var(--ink-3)]",
        "transition-transform duration-[var(--dur-fast)] ease-[var(--ease)]",
        open ? "rotate-90" : "",
      ].join(" ")}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
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

function PencilGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
