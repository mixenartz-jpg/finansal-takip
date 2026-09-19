import { asKurus } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import { eachDay } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";
import type { Transaction } from "@/features/transactions/types";

/**
 * Kategori grafiğinde gösterilecek azami dilim sayısı.
 *
 * ── NEDEN SINIR VAR ──
 *
 * Renk rampası sonludur ve her kategoriye yeni bir ton üretmek,
 * birbirinden ayırt edilemeyen renkler doğurur (renk körlüğünde
 * daha da kötü). Sınırın ötesindeki kategoriler "Diğer" altında
 * toplanır — bilgi kaybolmaz, yalnızca gruplanır.
 */
export const MAX_CATEGORY_SLICES = 6;

export interface MonthlySummary {
  incomeKurus: Kurus;
  expenseKurus: Kurus;
  /** Gelir − gider. Negatifse o dönem açık verilmiş. */
  netKurus: Kurus;
  transactionCount: number;
}

/**
 * Dönem özeti.
 *
 * TRANSFERLER TOPLAMLARA GİRMEZ: kendi hesapları arasında para
 * taşımak ne gelir ne giderdir. Dahil edilseydi bir transfer hem
 * gelir hem gider olarak sayılır ve özet iki kat şişerdi.
 * (`0004_views.sql` içindeki `monthly_category_totals` ile aynı kural.)
 */
export function monthlySummary(
  transactions: readonly Transaction[],
): MonthlySummary {
  let income = 0;
  let expense = 0;

  for (const t of transactions) {
    if (t.kind === "income") income += t.amountKurus;
    else if (t.kind === "expense") expense += t.amountKurus;
  }

  return {
    incomeKurus: asKurus(income),
    expenseKurus: asKurus(expense),
    netKurus: asKurus(income - expense),
    // Transferler de bir işlemdir; sayıma dahil.
    transactionCount: transactions.length,
  };
}

export interface CategorySlice {
  /** Kategori kimliği; "Diğer" ve "Kategorisiz" için null. */
  categoryId: string | null;
  name: string;
  totalKurus: Kurus;
  /** Toplam içindeki payı (0-100). */
  percent: number;
  transactionCount: number;
}

/**
 * Kategori dağılımı, büyükten küçüğe.
 *
 * Sınırı aşan kategoriler "Diğer"de toplanır ve o dilim daima
 * en sonda durur — sıralama büyüklüğe göre olsa da "Diğer" bir
 * kategori değil, bir artıktır.
 */
export function categoryBreakdown(
  transactions: readonly Transaction[],
  categoryNames: ReadonlyMap<string, string>,
  kind: "income" | "expense",
): CategorySlice[] {
  const totals = new Map<string | null, { total: number; count: number }>();
  let grandTotal = 0;

  for (const t of transactions) {
    // Transferler burada da dışarıda: kategorisi olmaz (şema
    // `transfer_shape` ile zorlar) ve bir harcama değildir.
    if (t.kind !== kind) continue;

    const key = t.categoryId;
    const entry = totals.get(key) ?? { total: 0, count: 0 };
    entry.total += t.amountKurus;
    entry.count += 1;
    totals.set(key, entry);
    grandTotal += t.amountKurus;
  }

  if (grandTotal === 0) return [];

  const slices: CategorySlice[] = [...totals.entries()].map(([id, v]) => ({
    categoryId: id,
    name: id === null ? "Kategorisiz" : (categoryNames.get(id) ?? "Kategorisiz"),
    totalKurus: asKurus(v.total),
    percent: (v.total / grandTotal) * 100,
    transactionCount: v.count,
  }));

  slices.sort((a, b) => b.totalKurus - a.totalKurus);

  if (slices.length <= MAX_CATEGORY_SLICES) return slices;

  const head = slices.slice(0, MAX_CATEGORY_SLICES);
  const tail = slices.slice(MAX_CATEGORY_SLICES);

  const otherTotal = tail.reduce((sum, s) => sum + s.totalKurus, 0);
  head.push({
    categoryId: null,
    name: "Diğer",
    totalKurus: asKurus(otherTotal),
    percent: (otherTotal / grandTotal) * 100,
    transactionCount: tail.reduce((sum, s) => sum + s.transactionCount, 0),
  });

  return head;
}

export interface DailyFlow {
  date: DateStr;
  incomeKurus: Kurus;
  expenseKurus: Kurus;
}

/**
 * Günlük gelir/gider serisi.
 *
 * ── BOŞ GÜNLER DE ÜRETİLİR ──
 *
 * İşlem olmayan günleri atlamak çizgi grafikte YANLIŞ EĞİM üretir:
 * 1 Eylül ve 10 Eylül arasında veri yoksa, iki noktayı birleştiren
 * düz çizgi "para yavaşça azaldı" der — oysa hiçbir şey olmamıştır.
 * Sıfır değerli günler bu yalanı engeller.
 */
export function dailyCashflow(
  transactions: readonly Transaction[],
  from: DateStr,
  to: DateStr,
): DailyFlow[] {
  const byDate = new Map<string, { income: number; expense: number }>();

  for (const t of transactions) {
    if (t.kind === "transfer") continue;
    if (t.date < from || t.date > to) continue;

    const entry = byDate.get(t.date) ?? { income: 0, expense: 0 };
    if (t.kind === "income") entry.income += t.amountKurus;
    else entry.expense += t.amountKurus;
    byDate.set(t.date, entry);
  }

  return eachDay(from, to).map((date) => {
    const e = byDate.get(date);
    return {
      date,
      incomeKurus: asKurus(e?.income ?? 0),
      expenseKurus: asKurus(e?.expense ?? 0),
    };
  });
}

export interface BalancePoint {
  date: DateStr;
  balanceKurus: Kurus;
}

/**
 * Kümülatif bakiye serisi — nakit akışı grafiğinin çizgisi.
 *
 * Başlangıç bakiyesinden başlar, her günün net akışını ekler.
 * Negatife düşebilir: bu bilgidir, kırpılmaz.
 */
export function cumulativeBalance(
  daily: readonly DailyFlow[],
  startingKurus: Kurus,
): BalancePoint[] {
  let running = startingKurus as number;

  return daily.map((d) => {
    running += d.incomeKurus - d.expenseKurus;
    return { date: d.date, balanceKurus: asKurus(running) };
  });
}
