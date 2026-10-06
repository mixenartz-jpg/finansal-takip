import { describe, expect, test } from "vitest";
import { groupByDay, isDayOpen } from "./grouping";
import type { Transaction, TransactionKind } from "./types";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";

/**
 * Gün grupları — SAF mantık.
 *
 * Günün toplamı kapalı kutunun tek içeriği: yanlış hesaplanırsa
 * kullanıcı kutuyu açmadan yanlış bilgiyle kalır.
 */

const today = "2026-10-06" as DateStr;
const yesterday = "2026-10-05" as DateStr;

let seq = 0;
function tx(date: DateStr, kind: TransactionKind, amount: number): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    kind,
    amountKurus: amount as Kurus,
    date,
    accountId: "a1",
    counterAccountId: kind === "transfer" ? "a2" : null,
    categoryId: null,
    note: null,
    voiceTranscript: null,
    source: "manual",
    recurringId: null,
    createdAt: "2026-10-06T10:00:00Z",
  };
}

describe("groupByDay", () => {
  test("işlemleri güne göre toplar, geliş sırasını korur", () => {
    const a = tx(today, "expense", 100);
    const b = tx(today, "expense", 200);
    const c = tx(yesterday, "expense", 300);

    const days = groupByDay([a, b, c]);

    expect(days.map((d) => d.date)).toEqual([today, yesterday]);
    expect(days[0].items).toEqual([a, b]);
    expect(days[1].items).toEqual([c]);
  });

  test("gider ve gelir toplamı ayrı tutulur", () => {
    const [day] = groupByDay([
      tx(today, "expense", 30000),
      tx(today, "expense", 50000),
      tx(today, "income", 1500000),
    ]);

    expect(day.expenseKurus).toBe(80000);
    expect(day.incomeKurus).toBe(1500000);
  });

  test("transfer ne gider ne gelir sayılır", () => {
    const [day] = groupByDay([tx(today, "transfer", 99900), tx(today, "expense", 100)]);

    expect(day.expenseKurus).toBe(100);
    expect(day.incomeKurus).toBe(0);
    expect(day.items).toHaveLength(2);
  });

  test("boş listede grup yok", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("isDayOpen", () => {
  const none = new Map<DateStr, boolean>();

  test("bugün açık gelir", () => {
    expect(isDayOpen(today, today, none)).toBe(true);
  });

  test("önceki günler kapalı gelir", () => {
    expect(isDayOpen(yesterday, today, none)).toBe(false);
  });

  test("kullanıcının seçimi varsayılanı ezer -- iki yönde de", () => {
    const overrides = new Map<DateStr, boolean>([
      [today, false],
      [yesterday, true],
    ]);

    expect(isDayOpen(today, today, overrides)).toBe(false);
    expect(isDayOpen(yesterday, today, overrides)).toBe(true);
  });
});
