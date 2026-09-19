import { describe, test, expect } from "vitest";
import {
  debtStatus,
  paidRatio,
  summarizeDebts,
  dueStatus,
  dueLabel,
  DUE_SOON_DAYS,
} from "./remaining";
import type { DebtBalance } from "./types";
import { asKurus } from "@/lib/money/money";
import { asDateStr } from "@/lib/date/date";

const TODAY = asDateStr("2026-09-19");

function debt(over: Partial<DebtBalance> = {}): DebtBalance {
  const principal = over.principalKurus ?? asKurus(100_000);
  const paid = over.paidKurus ?? asKurus(0);
  return {
    id: over.debtId ?? "d1",
    debtId: "d1",
    direction: "payable",
    counterparty: "Ahmet",
    principalKurus: principal,
    paidKurus: paid,
    remainingKurus: asKurus(principal - paid),
    paymentCount: 0,
    lastPaymentDate: null,
    openedOn: asDateStr("2026-01-01"),
    dueOn: null,
    note: null,
    ...over,
  };
}

describe("paidRatio", () => {
  test("hiç ödenmemiş", () => {
    expect(paidRatio(debt({ paidKurus: asKurus(0) }))).toBe(0);
  });
  test("yarısı ödenmiş", () => {
    expect(paidRatio(debt({ paidKurus: asKurus(50_000) }))).toBe(0.5);
  });
  test("tamamı ödenmiş", () => {
    expect(paidRatio(debt({ paidKurus: asKurus(100_000) }))).toBe(1);
  });
  test("fazla ödemede 1'den büyük -- kırpılmaz, fazlalık bilgidir", () => {
    expect(paidRatio(debt({ paidKurus: asKurus(120_000) }))).toBe(1.2);
  });
  test("anapara sıfırsa 0 döner -- bölme hatası fırlatmaz", () => {
    expect(paidRatio(debt({ principalKurus: asKurus(0) }))).toBe(0);
  });
});

describe("debtStatus", () => {
  test("hiç ödeme yoksa 'open'", () => {
    expect(debtStatus(debt({ paidKurus: asKurus(0) }))).toBe("open");
  });
  test("kısmi ödemede 'partial'", () => {
    expect(debtStatus(debt({ paidKurus: asKurus(40_000) }))).toBe("partial");
  });
  test("tam ödemede 'closed'", () => {
    expect(debtStatus(debt({ paidKurus: asKurus(100_000) }))).toBe("closed");
  });
  test("fazla ödemede de 'closed'", () => {
    expect(debtStatus(debt({ paidKurus: asKurus(130_000) }))).toBe("closed");
  });
  test("★ bir kuruş eksikte hâlâ 'partial' -- yuvarlama kapatmaz", () => {
    expect(debtStatus(debt({ paidKurus: asKurus(99_999) }))).toBe("partial");
  });
});

describe("dueStatus -- vade durumu", () => {
  test("vadesiz borçta 'none'", () => {
    expect(dueStatus(debt({ dueOn: null }), TODAY)).toBe("none");
  });
  test("kapanmış borçta vade uyarısı yok", () => {
    const d = debt({ paidKurus: asKurus(100_000), dueOn: asDateStr("2026-01-01") });
    expect(dueStatus(d, TODAY)).toBe("none");
  });
  test("uzak vadede 'ok'", () => {
    expect(dueStatus(debt({ dueOn: asDateStr("2026-12-31") }), TODAY)).toBe("ok");
  });
  test("yaklaşan vadede 'soon'", () => {
    const soon = asDateStr("2026-09-25"); // 6 gün sonra
    expect(dueStatus(debt({ dueOn: soon }), TODAY)).toBe("soon");
  });
  test("bugün vade günüyse 'soon'", () => {
    expect(dueStatus(debt({ dueOn: TODAY }), TODAY)).toBe("soon");
  });
  test("geçmiş vadede 'overdue'", () => {
    expect(dueStatus(debt({ dueOn: asDateStr("2026-09-01") }), TODAY)).toBe("overdue");
  });
  test("eşik sınırında 'soon'", () => {
    const edge = asDateStr("2026-09-26"); // tam DUE_SOON_DAYS sonra
    expect(DUE_SOON_DAYS).toBe(7);
    expect(dueStatus(debt({ dueOn: edge }), TODAY)).toBe("soon");
  });
  test("eşiğin bir gün ötesinde 'ok'", () => {
    expect(dueStatus(debt({ dueOn: asDateStr("2026-09-27") }), TODAY)).toBe("ok");
  });
});

describe("summarizeDebts", () => {
  test("boş listede sıfırlar", () => {
    const s = summarizeDebts([], TODAY);
    expect(s.payableRemainingKurus).toBe(0);
    expect(s.receivableRemainingKurus).toBe(0);
    expect(s.overdueCount).toBe(0);
    expect(s.dueSoonCount).toBe(0);
  });

  test("borç ve alacak ayrı toplanır", () => {
    const s = summarizeDebts(
      [
        debt({ debtId: "a", direction: "payable", principalKurus: asKurus(100_000) }),
        debt({ debtId: "b", direction: "receivable", principalKurus: asKurus(30_000) }),
      ],
      TODAY,
    );
    expect(s.payableRemainingKurus).toBe(100_000);
    expect(s.receivableRemainingKurus).toBe(30_000);
  });

  test("kapanmış borç toplamlara girmez", () => {
    const s = summarizeDebts(
      [
        debt({ debtId: "a", principalKurus: asKurus(100_000), paidKurus: asKurus(100_000) }),
        debt({ debtId: "b", principalKurus: asKurus(50_000), paidKurus: asKurus(0) }),
      ],
      TODAY,
    );
    expect(s.payableRemainingKurus).toBe(50_000);
  });

  test("kısmi ödenmiş borçta yalnızca kalan sayılır", () => {
    const s = summarizeDebts(
      [debt({ principalKurus: asKurus(100_000), paidKurus: asKurus(40_000) })],
      TODAY,
    );
    expect(s.payableRemainingKurus).toBe(60_000);
  });

  test("vadesi geçen ve yaklaşanlar sayılır", () => {
    const s = summarizeDebts(
      [
        debt({ debtId: "a", dueOn: asDateStr("2026-09-01") }), // overdue
        debt({ debtId: "b", dueOn: asDateStr("2026-09-22") }), // soon
        debt({ debtId: "c", dueOn: asDateStr("2026-12-01") }), // ok
        debt({ debtId: "d", dueOn: null }),                     // none
      ],
      TODAY,
    );
    expect(s.overdueCount).toBe(1);
    expect(s.dueSoonCount).toBe(1);
  });

  test("dikkat gerektirenler ayrı liste olarak döner", () => {
    const s = summarizeDebts(
      [
        debt({ debtId: "a", dueOn: asDateStr("2026-09-01") }),
        debt({ debtId: "b", dueOn: asDateStr("2026-12-01") }),
      ],
      TODAY,
    );
    expect(s.needsAttention.map((d) => d.debtId)).toEqual(["a"]);
  });

  test("net durum: alacak eksi borç", () => {
    const s = summarizeDebts(
      [
        debt({ debtId: "a", direction: "receivable", principalKurus: asKurus(80_000) }),
        debt({ debtId: "b", direction: "payable", principalKurus: asKurus(30_000) }),
      ],
      TODAY,
    );
    expect(s.netKurus).toBe(50_000);
  });

  test("borç alacaktan fazlaysa net negatif", () => {
    const s = summarizeDebts(
      [debt({ direction: "payable", principalKurus: asKurus(30_000) })],
      TODAY,
    );
    expect(s.netKurus).toBe(-30_000);
  });

  test("kuruş aritmetiği tam sayı kalır", () => {
    const s = summarizeDebts(
      [debt({ principalKurus: asKurus(33_333), paidKurus: asKurus(11_111) })],
      TODAY,
    );
    expect(Number.isInteger(s.payableRemainingKurus)).toBe(true);
    expect(Number.isInteger(s.netKurus)).toBe(true);
  });
});

describe("dueLabel -- vade metni", () => {
  test("vadesiz borçta metin yok", () => {
    expect(dueLabel(debt({ dueOn: null }), TODAY)).toBeNull();
  });

  test("uzak vadede metin yok -- gereksiz gürültü üretmez", () => {
    expect(dueLabel(debt({ dueOn: asDateStr("2026-12-31") }), TODAY)).toBeNull();
  });

  test("kapanmış borçta metin yok", () => {
    const d = debt({ paidKurus: asKurus(100_000), dueOn: asDateStr("2026-01-01") });
    expect(dueLabel(d, TODAY)).toBeNull();
  });

  test("yaklaşan vadede kalan gün sayısı", () => {
    expect(dueLabel(debt({ dueOn: asDateStr("2026-09-22") }), TODAY)).toBe("3 gün kaldı");
  });

  test("bugün vade günüyse 'Bugün son gün'", () => {
    // "0 gün kaldı" kendini yalanlayan bir cümle olurdu.
    expect(dueLabel(debt({ dueOn: TODAY }), TODAY)).toBe("Bugün son gün");
  });

  test("geçmiş vadede gecikme gün sayısı", () => {
    expect(dueLabel(debt({ dueOn: asDateStr("2026-09-05") }), TODAY)).toBe("14 gün gecikti");
  });

  test("bir gün gecikmede tekil ifade", () => {
    expect(dueLabel(debt({ dueOn: asDateStr("2026-09-18") }), TODAY)).toBe("1 gün gecikti");
  });

  test("eşik sınırında metin üretilir", () => {
    const edge = asDateStr("2026-09-26");
    expect(dueLabel(debt({ dueOn: edge }), TODAY)).toBe("7 gün kaldı");
  });
});
