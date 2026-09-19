import { describe, test, expect } from "vitest";
import {
  monthlySummary,
  categoryBreakdown,
  dailyCashflow,
  cumulativeBalance,
  MAX_CATEGORY_SLICES,
} from "./aggregate";
import type { Transaction } from "@/features/transactions/types";
import { asKurus } from "@/lib/money/money";
import { asDateStr } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";

let seq = 0;
function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${seq++}`,
    kind: "expense",
    amountKurus: asKurus(10_000),
    date: asDateStr("2026-09-10"),
    accountId: "acc-1",
    counterAccountId: null,
    categoryId: "cat-yemek",
    note: null,
    voiceTranscript: null,
    source: "manual",
    recurringId: null,
    createdAt: "2026-09-10T10:00:00Z",
    ...over,
  };
}

describe("monthlySummary", () => {
  test("boş listede sıfırlar", () => {
    const s = monthlySummary([]);
    expect(s.incomeKurus).toBe(0);
    expect(s.expenseKurus).toBe(0);
    expect(s.netKurus).toBe(0);
    expect(s.transactionCount).toBe(0);
  });

  test("gelir ve gideri ayrı toplar", () => {
    const s = monthlySummary([
      tx({ kind: "income", amountKurus: asKurus(500_000) }),
      tx({ kind: "expense", amountKurus: asKurus(120_000) }),
      tx({ kind: "expense", amountKurus: asKurus(30_000) }),
    ]);
    expect(s.incomeKurus).toBe(500_000);
    expect(s.expenseKurus).toBe(150_000);
    expect(s.netKurus).toBe(350_000);
  });

  test("★ transferler toplamlara girmez", () => {
    // Kendi hesapları arası para taşımak ne gelir ne giderdir;
    // dahil edilseydi özet iki kat şişerdi.
    const s = monthlySummary([
      tx({ kind: "income", amountKurus: asKurus(100_000) }),
      tx({ kind: "transfer", amountKurus: asKurus(900_000), categoryId: null }),
    ]);
    expect(s.incomeKurus).toBe(100_000);
    expect(s.expenseKurus).toBe(0);
  });

  test("gider gelirden fazlaysa net negatif", () => {
    const s = monthlySummary([
      tx({ kind: "income", amountKurus: asKurus(50_000) }),
      tx({ kind: "expense", amountKurus: asKurus(80_000) }),
    ]);
    expect(s.netKurus).toBe(-30_000);
  });

  test("işlem sayısı transferleri de sayar", () => {
    const s = monthlySummary([
      tx({ kind: "income" }),
      tx({ kind: "transfer", categoryId: null }),
    ]);
    expect(s.transactionCount).toBe(2);
  });

  test("kuruş aritmetiği tam sayı kalır", () => {
    const s = monthlySummary([
      tx({ kind: "expense", amountKurus: asKurus(3_333) }),
      tx({ kind: "expense", amountKurus: asKurus(3_333) }),
    ]);
    expect(Number.isInteger(s.expenseKurus)).toBe(true);
    expect(s.expenseKurus).toBe(6_666);
  });
});

describe("categoryBreakdown", () => {
  const names = new Map([
    ["cat-yemek", "Yemek"],
    ["cat-market", "Market"],
    ["cat-ulasim", "Ulaşım"],
  ]);

  test("boş listede boş dizi", () => {
    expect(categoryBreakdown([], names, "expense")).toEqual([]);
  });

  test("kategoriye göre toplar ve büyükten küçüğe sıralar", () => {
    const rows = categoryBreakdown(
      [
        tx({ categoryId: "cat-yemek", amountKurus: asKurus(30_000) }),
        tx({ categoryId: "cat-market", amountKurus: asKurus(80_000) }),
        tx({ categoryId: "cat-yemek", amountKurus: asKurus(20_000) }),
      ],
      names,
      "expense",
    );
    expect(rows.map((r) => r.name)).toEqual(["Market", "Yemek"]);
    expect(rows[0].totalKurus).toBe(80_000);
    expect(rows[1].totalKurus).toBe(50_000);
  });

  test("yüzdeleri hesaplar", () => {
    const rows = categoryBreakdown(
      [
        tx({ categoryId: "cat-market", amountKurus: asKurus(75_000) }),
        tx({ categoryId: "cat-yemek", amountKurus: asKurus(25_000) }),
      ],
      names,
      "expense",
    );
    expect(rows[0].percent).toBe(75);
    expect(rows[1].percent).toBe(25);
  });

  test("★ yalnızca istenen tür sayılır", () => {
    const rows = categoryBreakdown(
      [
        tx({ kind: "expense", categoryId: "cat-yemek", amountKurus: asKurus(30_000) }),
        tx({ kind: "income", categoryId: "cat-maas", amountKurus: asKurus(500_000) }),
      ],
      names,
      "expense",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalKurus).toBe(30_000);
  });

  test("★ transferler dahil edilmez", () => {
    const rows = categoryBreakdown(
      [tx({ kind: "transfer", categoryId: null, amountKurus: asKurus(900_000) })],
      names,
      "expense",
    );
    expect(rows).toEqual([]);
  });

  test("kategorisiz işlemler 'Kategorisiz' altında toplanır", () => {
    const rows = categoryBreakdown(
      [
        tx({ categoryId: null, amountKurus: asKurus(40_000) }),
        tx({ categoryId: null, amountKurus: asKurus(10_000) }),
      ],
      names,
      "expense",
    );
    expect(rows[0].name).toBe("Kategorisiz");
    expect(rows[0].totalKurus).toBe(50_000);
  });

  test("★ sınırı aşan kategoriler 'Diğer'de toplanır", () => {
    // Renk rampası sınırlı; her kategoriye yeni bir ton üretmek
    // ayırt edilemeyen renkler doğurur.
    const many = new Map<string, string>();
    const txs: Transaction[] = [];
    for (let i = 0; i < 12; i++) {
      many.set(`c${i}`, `Kategori ${i}`);
      txs.push(tx({ categoryId: `c${i}`, amountKurus: asKurus((12 - i) * 10_000) }));
    }
    const rows = categoryBreakdown(txs, many, "expense");
    expect(rows.length).toBe(MAX_CATEGORY_SLICES + 1);
    expect(rows[rows.length - 1].name).toBe("Diğer");
  });

  test("'Diğer' kalan tüm tutarı taşır", () => {
    const many = new Map<string, string>();
    const txs: Transaction[] = [];
    for (let i = 0; i < 10; i++) {
      many.set(`c${i}`, `K${i}`);
      txs.push(tx({ categoryId: `c${i}`, amountKurus: asKurus(10_000) }));
    }
    const rows = categoryBreakdown(txs, many, "expense");
    const total = rows.reduce((a, r) => a + r.totalKurus, 0);
    expect(total).toBe(100_000);
  });

  test("sınırın altındaki kategori sayısında 'Diğer' oluşmaz", () => {
    const rows = categoryBreakdown(
      [tx({ categoryId: "cat-yemek" }), tx({ categoryId: "cat-market" })],
      names,
      "expense",
    );
    expect(rows.some((r) => r.name === "Diğer")).toBe(false);
  });
});

describe("dailyCashflow", () => {
  const from = asDateStr("2026-09-01");
  const to = asDateStr("2026-09-05");

  test("aralıktaki her gün için satır üretir -- boş günler dahil", () => {
    // Eksik günleri atlamak çizgi grafikte yanlış eğim üretir:
    // iki nokta arası boşluk gerçekte düz bir çizgi değil.
    const rows = dailyCashflow([], from, to);
    expect(rows).toHaveLength(5);
    expect(rows[0].date).toBe("2026-09-01");
    expect(rows[4].date).toBe("2026-09-05");
  });

  test("günlük gelir ve gideri toplar", () => {
    const rows = dailyCashflow(
      [
        tx({ date: asDateStr("2026-09-02"), kind: "income", amountKurus: asKurus(50_000) }),
        tx({ date: asDateStr("2026-09-02"), kind: "expense", amountKurus: asKurus(20_000) }),
      ],
      from,
      to,
    );
    const day2 = rows.find((r) => r.date === "2026-09-02");
    expect(day2?.incomeKurus).toBe(50_000);
    expect(day2?.expenseKurus).toBe(20_000);
  });

  test("aralık dışı işlemler yok sayılır", () => {
    const rows = dailyCashflow(
      [tx({ date: asDateStr("2026-08-15"), amountKurus: asKurus(99_000) })],
      from,
      to,
    );
    expect(rows.every((r) => r.expenseKurus === 0)).toBe(true);
  });

  test("transferler sayılmaz", () => {
    const rows = dailyCashflow(
      [tx({ date: asDateStr("2026-09-03"), kind: "transfer", categoryId: null })],
      from,
      to,
    );
    expect(rows.every((r) => r.incomeKurus === 0 && r.expenseKurus === 0)).toBe(true);
  });

  test("tek günlük aralık çalışır", () => {
    const rows = dailyCashflow([], from, from);
    expect(rows).toHaveLength(1);
  });
});

describe("cumulativeBalance", () => {
  test("başlangıç bakiyesinden itibaren birikir", () => {
    const daily = [
      { date: asDateStr("2026-09-01") as DateStr, incomeKurus: asKurus(100_000), expenseKurus: asKurus(0) },
      { date: asDateStr("2026-09-02") as DateStr, incomeKurus: asKurus(0), expenseKurus: asKurus(30_000) },
    ];
    const rows = cumulativeBalance(daily, asKurus(50_000));
    expect(rows[0].balanceKurus).toBe(150_000);
    expect(rows[1].balanceKurus).toBe(120_000);
  });

  test("boş listede boş dizi", () => {
    expect(cumulativeBalance([], asKurus(0))).toEqual([]);
  });

  test("negatif bakiyeye düşebilir", () => {
    const daily = [
      { date: asDateStr("2026-09-01") as DateStr, incomeKurus: asKurus(0), expenseKurus: asKurus(80_000) },
    ];
    expect(cumulativeBalance(daily, asKurus(20_000))[0].balanceKurus).toBe(-60_000);
  });

  test("kuruş aritmetiği tam sayı kalır", () => {
    const daily = [
      { date: asDateStr("2026-09-01") as DateStr, incomeKurus: asKurus(3_333), expenseKurus: asKurus(1_111) },
    ];
    expect(Number.isInteger(cumulativeBalance(daily, asKurus(0))[0].balanceKurus)).toBe(true);
  });
});
