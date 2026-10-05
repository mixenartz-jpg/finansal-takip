import { describe, test, expect } from "vitest";
import {
  intentToAccountUpdate,
  intentToCategoryPatch,
  intentToDebtUpdate,
  intentToPaymentInput,
  intentToRuleUpdate,
  intentToTransactionPatch,
} from "./to-update";
import { asKurus } from "@/lib/money/money";
import { asDateStr } from "@/lib/date/date";
import type { Transaction } from "@/features/transactions/types";
import type { Account } from "@/features/accounts/types";
import type { Category } from "@/features/categories/types";
import type { RecurringRule } from "@/features/recurring/types";
import type { Debt } from "@/features/debts/types";

const categories = [
  { id: "c-market", name: "Market", kind: "expense" as const },
  { id: "c-ulasim", name: "Ulaşım", kind: "expense" as const },
  { id: "c-maas", name: "Maaş", kind: "income" as const },
];
const accounts = [
  { id: "a-nakit", name: "Nakit" },
  { id: "a-banka", name: "Banka" },
];
const ctx = { categories, accounts };

const expense: Transaction = {
  id: "t1",
  kind: "expense",
  amountKurus: asKurus(20_000),
  date: asDateStr("2026-10-04"),
  accountId: "a-nakit",
  counterAccountId: null,
  categoryId: "c-market",
  note: "Migros",
  voiceTranscript: null,
  source: "manual",
  recurringId: null,
  createdAt: "2026-10-04T10:00:00Z",
};

const transfer: Transaction = {
  ...expense,
  id: "t2",
  kind: "transfer",
  categoryId: null,
  counterAccountId: "a-banka",
  note: null,
};

describe("intentToTransactionPatch", () => {
  test("yalnızca verilen alan değişir, gerisi korunur", () => {
    const r = intentToTransactionPatch({ amountKurus: 25_000 }, expense, ctx);
    expect(r).toEqual({
      ok: true,
      input: {
        kind: "expense",
        amountKurus: 25_000,
        date: "2026-10-04",
        accountId: "a-nakit",
        counterAccountId: null,
        categoryId: "c-market",
        note: "Migros",
      },
    });
  });

  test("★ hiçbir değişiklik yoksa reddedilir", () => {
    const r = intentToTransactionPatch({ matchFrom: "2026-10-04" }, expense, ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/değiştireceğini/);
  });

  test("kategori ve hesap adları kimliğe çözülür", () => {
    const r = intentToTransactionPatch(
      { categoryName: "ulaşım", accountName: "Banka" },
      expense,
      ctx,
    );
    expect(r.ok && r.input.categoryId).toBe("c-ulasim");
    expect(r.ok && r.input.accountId).toBe("a-banka");
  });

  test("bilinmeyen kategori reddedilir", () => {
    expect(intentToTransactionPatch({ categoryName: "Kira" }, expense, ctx).ok).toBe(false);
  });

  /**
   * Gider → transfer: eski kategori taşınırsa `transfer_shape`
   * kısıtı ihlal edilir ve kullanıcı ham Postgres hatası görür.
   */
  test("★ gider → transfer: kategori düşer, hedef hesap gerekir", () => {
    const missing = intentToTransactionPatch({ kind: "transfer" }, expense, ctx);
    expect(missing.ok).toBe(false);

    const r = intentToTransactionPatch(
      { kind: "transfer", counterAccountName: "Banka" },
      expense,
      ctx,
    );
    expect(r.ok && r.input.categoryId).toBeNull();
    expect(r.ok && r.input.counterAccountId).toBe("a-banka");
  });

  test("★ transfer → gider: hedef hesap düşer", () => {
    const r = intentToTransactionPatch(
      { kind: "expense", categoryName: "Market" },
      transfer,
      ctx,
    );
    expect(r.ok && r.input.counterAccountId).toBeNull();
    expect(r.ok && r.input.categoryId).toBe("c-market");
  });

  test("tür değişince eski kategori taşınmaz", () => {
    const r = intentToTransactionPatch({ kind: "income" }, expense, ctx);
    expect(r.ok && r.input.categoryId).toBeNull();
  });

  test("★ türüne uymayan kategori reddedilir", () => {
    const r = intentToTransactionPatch({ categoryName: "Maaş" }, expense, ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/gelir kategorisi/);
  });

  test("boş açıklama notu temizler", () => {
    const r = intentToTransactionPatch({ note: "  " }, expense, ctx);
    expect(r.ok && r.input.note).toBeNull();
  });

  test("transferde hedef kaynakla aynı olamaz (doğrulayıcı yeniden kullanılır)", () => {
    const r = intentToTransactionPatch({ counterAccountName: "Nakit" }, transfer, ctx);
    expect(r.ok).toBe(false);
  });
});

describe("intentToAccountUpdate", () => {
  const card: Account = {
    id: "a-kart",
    name: "Kart",
    kind: "credit_card",
    openingKurus: asKurus(-5_000),
    creditLimitKurus: asKurus(1_000_000),
    colorSlot: 0,
    sortOrder: 0,
    archivedAt: null,
  };

  test("ad değişir; tür ve açılış bakiyesi korunur", () => {
    const r = intentToAccountUpdate({ name: "Bonus Kart" }, card);
    expect(r).toEqual({
      ok: true,
      input: {
        name: "Bonus Kart",
        kind: "credit_card",
        openingKurus: -5_000,
        creditLimitKurus: 1_000_000,
      },
    });
  });

  test("nakit hesaba limit konamaz", () => {
    const r = intentToAccountUpdate(
      { creditLimitKurus: 100 },
      { ...card, kind: "cash", creditLimitKurus: null },
    );
    expect(r.ok).toBe(false);
  });

  test("değişiklik yoksa reddedilir", () => {
    expect(intentToAccountUpdate({ accountName: "Kart" }, card).ok).toBe(false);
  });
});

describe("intentToCategoryPatch", () => {
  const cat: Category = {
    id: "c-market",
    name: "Market",
    kind: "expense",
    icon: null,
    colorSlot: 0,
    keywords: ["migros"],
    sortOrder: 0,
    archivedAt: null,
  };

  test("anahtar kelimeler değişir, ad ve tür korunur", () => {
    const r = intentToCategoryPatch({ keywords: ["a101", "bim"] }, cat);
    expect(r).toEqual({
      ok: true,
      input: { name: "Market", kind: "expense", keywords: ["a101", "bim"] },
    });
  });

  test("değişiklik yoksa reddedilir", () => {
    expect(intentToCategoryPatch({ categoryName: "Market" }, cat).ok).toBe(false);
  });
});

describe("intentToRuleUpdate", () => {
  const rule: RecurringRule = {
    id: "r1",
    name: "Spor",
    kind: "expense",
    amountKurus: asKurus(50_000),
    accountId: "a-banka",
    categoryId: null,
    note: null,
    freq: "weekly",
    dayOf: 1,
    monthOf: null,
    startDate: asDateStr("2026-01-01"),
    endDate: null,
    lastRunDate: null,
    pausedAt: null,
  };

  test("tutar değişir, sıklık ve hesap korunur", () => {
    const r = intentToRuleUpdate({ amountKurus: 60_000 }, rule);
    expect(r.ok && r.input.amountKurus).toBe(60_000);
    expect(r.ok && r.input.freq).toBe("weekly");
    expect(r.ok && r.input.accountId).toBe("a-banka");
  });

  test("★ haftalık kuralda gün 7'yi aşamaz", () => {
    const r = intentToRuleUpdate({ dayOf: 15 }, rule);
    expect(r.ok).toBe(false);
  });

  test("aylık kuralda gün 15 geçerli", () => {
    const r = intentToRuleUpdate({ dayOf: 15 }, { ...rule, freq: "monthly" });
    expect(r.ok && r.input.dayOf).toBe(15);
  });

  test("değişiklik yoksa reddedilir", () => {
    expect(intentToRuleUpdate({ ruleName: "Spor" }, rule).ok).toBe(false);
  });
});

describe("borç", () => {
  const debt: Debt = {
    id: "d1",
    direction: "payable",
    counterparty: "Ali",
    principalKurus: asKurus(100_000),
    openedOn: asDateStr("2026-09-01"),
    dueOn: null,
    note: null,
  };

  test("anapara değişir; araç amountKurus diyor, girdi principalKurus", () => {
    const r = intentToDebtUpdate({ amountKurus: 120_000 }, debt);
    expect(r.ok && r.input.principalKurus).toBe(120_000);
    expect(r.ok && r.input.counterparty).toBe("Ali");
  });

  test("vade açılıştan önce olamaz", () => {
    expect(intentToDebtUpdate({ dueDate: "2026-08-01" }, debt).ok).toBe(false);
  });

  test("değişiklik yoksa reddedilir", () => {
    expect(intentToDebtUpdate({ debtCounterparty: "Ali" }, debt).ok).toBe(false);
  });

  /**
   * Hesap söylenmediyse bakiyeye dokunulmaz: onay kartında hesap
   * satırı görünmezken bakiyenin değişmesi gizli bir yan etki olurdu.
   */
  test("★ hesap verilmezse işlem yaratılmaz", () => {
    const r = intentToPaymentInput({ amountKurus: 10_000 }, debt, accounts, "2026-10-05");
    expect(r).toEqual({
      ok: true,
      input: {
        debtId: "d1",
        amountKurus: 10_000,
        date: "2026-10-05",
        note: null,
        createTransaction: false,
        accountId: null,
      },
    });
  });

  test("hesap verilirse işlem o hesaptan yaratılır", () => {
    const r = intentToPaymentInput(
      { amountKurus: 10_000, accountName: "banka", date: "2026-10-01" },
      debt,
      accounts,
      "2026-10-05",
    );
    expect(r.ok && r.input.createTransaction).toBe(true);
    expect(r.ok && r.input.accountId).toBe("a-banka");
    expect(r.ok && r.input.date).toBe("2026-10-01");
  });

  test("ödeme borç açılışından önce olamaz", () => {
    const r = intentToPaymentInput(
      { amountKurus: 10_000, date: "2026-08-01" },
      debt,
      accounts,
      "2026-10-05",
    );
    expect(r.ok).toBe(false);
  });

  test("bilinmeyen hesap reddedilir", () => {
    const r = intentToPaymentInput(
      { amountKurus: 10_000, accountName: "Kasa" },
      debt,
      accounts,
      "2026-10-05",
    );
    expect(r.ok).toBe(false);
  });
});
