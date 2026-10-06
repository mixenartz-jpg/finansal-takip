import { ZERO_KURUS, addKurus } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import type { Transaction } from "./types";

/**
 * İşlemlerin güne göre gruplanması.
 *
 * ── NEDEN REACT'TEN AYRI ──
 *
 * Kapalı bir gün kutusunda kullanıcının gördüğü TEK şey günün
 * toplamı. O toplam saf fonksiyonda hesaplanınca `node` ortamında
 * (bkz. vitest.config.mts) jsdom kurmadan sınanabiliyor.
 */

export interface DayGroup {
  date: DateStr;
  items: readonly Transaction[];
  /** O günün giderleri toplamı. Transfer dahil DEĞİL. */
  expenseKurus: Kurus;
  /** O günün gelirleri toplamı. Transfer dahil DEĞİL. */
  incomeKurus: Kurus;
}

/**
 * Tarihe göre gruplar; işlemler zaten tarihe göre sıralı gelir ve
 * o sıra korunur.
 *
 * Transfer toplamlara girmez: kendi hesapları arasında para taşımak
 * ne gelir ne giderdir.
 */
export function groupByDay(transactions: readonly Transaction[]): DayGroup[] {
  const byDate = new Map<DateStr, Transaction[]>();
  for (const tx of transactions) {
    byDate.set(tx.date, [...(byDate.get(tx.date) ?? []), tx]);
  }

  return [...byDate.entries()].map(([date, items]) => ({
    date,
    items,
    expenseKurus: totalOf(items, "expense"),
    incomeKurus: totalOf(items, "income"),
  }));
}

function totalOf(items: readonly Transaction[], kind: "expense" | "income"): Kurus {
  return items
    .filter((tx) => tx.kind === kind)
    .reduce((sum, tx) => addKurus(sum, tx.amountKurus), ZERO_KURUS);
}

/**
 * Gün kutusu açık mı?
 *
 * Varsayılan: yalnızca bugün açık. Geçmiş günler kapalı gelir ve
 * başlıklarında toplamı taşır; kullanıcı merak ettiği günü açar.
 * Elle yapılan seçim (`overrides`) varsayılanı iki yönde de ezer.
 */
export function isDayOpen(
  date: DateStr,
  today: DateStr,
  overrides: ReadonlyMap<DateStr, boolean>,
): boolean {
  return overrides.get(date) ?? date === today;
}
