import { describe, test, expect } from "vitest";
import {
  budgetStatus,
  spentRatio,
  overspendKurus,
  summarizeBudgets,
  WARN_RATIO,
} from "./progress";
import { asKurus } from "@/lib/money/money";
import type { BudgetProgress } from "./types";
import { asDateStr } from "@/lib/date/date";

function bp(limit: number, spent: number, id = "b1"): BudgetProgress {
  return {
    budgetId: id,
    categoryId: `cat-${id}`,
    month: asDateStr("2026-09-01"),
    limitKurus: asKurus(limit),
    spentKurus: asKurus(spent),
    remainingKurus: asKurus(limit - spent),
  };
}

describe("spentRatio", () => {
  test("yarısı harcanmış", () => {
    expect(spentRatio(bp(100_000, 50_000))).toBe(0.5);
  });
  test("hiç harcanmamış", () => {
    expect(spentRatio(bp(100_000, 0))).toBe(0);
  });
  test("tam limitte", () => {
    expect(spentRatio(bp(100_000, 100_000))).toBe(1);
  });
  test("aşımda 1'den büyük döner -- kırpılmaz, aşım miktarı bilgidir", () => {
    expect(spentRatio(bp(100_000, 150_000))).toBe(1.5);
  });
  test("limit sıfırsa 0 döner -- bölme hatası fırlatmaz", () => {
    expect(spentRatio(bp(0, 5_000))).toBe(0);
  });
});

describe("budgetStatus", () => {
  test("az harcamada 'ok'", () => {
    expect(budgetStatus(bp(100_000, 30_000))).toBe("ok");
  });
  test("eşiğin hemen altında hâlâ 'ok'", () => {
    expect(budgetStatus(bp(100_000, WARN_RATIO * 100_000 - 1))).toBe("ok");
  });
  test("eşikte 'warning'", () => {
    expect(budgetStatus(bp(100_000, WARN_RATIO * 100_000))).toBe("warning");
  });
  test("limitin hemen altında 'warning'", () => {
    expect(budgetStatus(bp(100_000, 99_999))).toBe("warning");
  });
  test("tam limitte 'over' -- limit dolmuşsa aşılmış sayılır", () => {
    expect(budgetStatus(bp(100_000, 100_000))).toBe("over");
  });
  test("limitin üstünde 'over'", () => {
    expect(budgetStatus(bp(100_000, 120_000))).toBe("over");
  });
  test("hiç harcama yoksa 'ok'", () => {
    expect(budgetStatus(bp(100_000, 0))).toBe("ok");
  });
});

describe("overspendKurus", () => {
  test("aşım yoksa sıfır", () => {
    expect(overspendKurus(bp(100_000, 80_000))).toBe(0);
  });
  test("tam limitte sıfır -- henüz aşım yok", () => {
    expect(overspendKurus(bp(100_000, 100_000))).toBe(0);
  });
  test("aşımda farkı döner", () => {
    expect(overspendKurus(bp(100_000, 130_000))).toBe(30_000);
  });
});

describe("summarizeBudgets", () => {
  test("boş listede sıfırlar döner", () => {
    const s = summarizeBudgets([]);
    expect(s.totalLimitKurus).toBe(0);
    expect(s.totalSpentKurus).toBe(0);
    expect(s.overCount).toBe(0);
    expect(s.warningCount).toBe(0);
  });

  test("toplamları hesaplar", () => {
    const s = summarizeBudgets([bp(100_000, 40_000, "a"), bp(50_000, 10_000, "b")]);
    expect(s.totalLimitKurus).toBe(150_000);
    expect(s.totalSpentKurus).toBe(50_000);
  });

  test("aşan ve uyarıdaki bütçeleri sayar", () => {
    const s = summarizeBudgets([
      bp(100_000, 120_000, "a"), // over
      bp(100_000, 85_000, "b"),  // warning
      bp(100_000, 10_000, "c"),  // ok
      bp(100_000, 100_000, "d"), // over (tam limit)
    ]);
    expect(s.overCount).toBe(2);
    expect(s.warningCount).toBe(1);
  });

  test("aşan bütçeleri ayrı liste olarak döner", () => {
    const over = bp(100_000, 120_000, "a");
    const s = summarizeBudgets([over, bp(100_000, 10_000, "b")]);
    expect(s.over.map((b) => b.budgetId)).toEqual(["a"]);
  });

  test("toplam aşım miktarını hesaplar", () => {
    const s = summarizeBudgets([
      bp(100_000, 130_000, "a"), // 30.000 aşım
      bp(50_000, 60_000, "b"),   // 10.000 aşım
      bp(100_000, 10_000, "c"),  // aşım yok
    ]);
    expect(s.totalOverspendKurus).toBe(40_000);
  });

  test("kuruş aritmetiği tam sayı kalır -- float sızmaz", () => {
    const s = summarizeBudgets([bp(33_333, 11_111, "a"), bp(33_333, 11_111, "b")]);
    expect(Number.isInteger(s.totalLimitKurus)).toBe(true);
    expect(Number.isInteger(s.totalSpentKurus)).toBe(true);
  });
});

describe("★ tam limit ile aşım ayrı durumlar", () => {
  test("tam limitte aşım sıfırdır ama durum 'over'dır", () => {
    const p = bp(200_000, 200_000);
    expect(budgetStatus(p)).toBe("over");
    expect(overspendKurus(p)).toBe(0);
    // Bu ikisinin birlikte olması "0 ₺ aştınız" gibi kendini
    // yalanlayan bir metne yol açabilir; BudgetBar bunu ayrı
    // cümleyle ("Limit doldu") karşılar.
  });

  test("bir kuruş aşımda hem 'over' hem pozitif aşım", () => {
    const p = bp(200_000, 200_001);
    expect(budgetStatus(p)).toBe("over");
    expect(overspendKurus(p)).toBe(1);
  });

  test("bir kuruş altta 'warning', aşım yok", () => {
    const p = bp(200_000, 199_999);
    expect(budgetStatus(p)).toBe("warning");
    expect(overspendKurus(p)).toBe(0);
  });
});
