import { describe, test, expect } from "vitest";
import { validateDebt, validatePayment } from "./types";
import { asKurus } from "@/lib/money/money";
import { asDateStr } from "@/lib/date/date";

const debtBase = {
  direction: "payable" as const,
  counterparty: "Ahmet",
  principalKurus: asKurus(100_000),
  openedOn: asDateStr("2026-01-01"),
  dueOn: null,
  note: null,
};

describe("validateDebt -- gecerli girdiler", () => {
  test("vadesiz borc gecerli", () => {
    expect(validateDebt(debtBase).valid).toBe(true);
  });
  test("vadeli borc gecerli", () => {
    expect(validateDebt({ ...debtBase, dueOn: asDateStr("2026-06-01") }).valid).toBe(true);
  });
  test("alacak yonu gecerli", () => {
    expect(validateDebt({ ...debtBase, direction: "receivable" }).valid).toBe(true);
  });
});

describe("validateDebt -- zorunlu alanlar", () => {
  test("karsi taraf bos olamaz", () => {
    expect(validateDebt({ ...debtBase, counterparty: "   " }).errors.counterparty).toBeTruthy();
  });
  test("tutar sifirdan buyuk olmali", () => {
    expect(validateDebt({ ...debtBase, principalKurus: asKurus(0) }).errors.principalKurus).toBeTruthy();
  });
  test("negatif tutar reddedilir", () => {
    expect(validateDebt({ ...debtBase, principalKurus: asKurus(-100) }).errors.principalKurus).toBeTruthy();
  });
  test("tarih zorunlu", () => {
    expect(validateDebt({ ...debtBase, openedOn: undefined }).errors.openedOn).toBeTruthy();
  });
});

describe("validateDebt -- ★ vade, acilistan once olamaz", () => {
  test("erken vade reddedilir -- due_after_opened kisiti", () => {
    const r = validateDebt({
      ...debtBase, openedOn: asDateStr("2026-06-01"), dueOn: asDateStr("2026-01-01"),
    });
    expect(r.errors.dueOn).toBeTruthy();
  });
  test("ayni gun vade kabul edilir", () => {
    const r = validateDebt({
      ...debtBase, openedOn: asDateStr("2026-06-01"), dueOn: asDateStr("2026-06-01"),
    });
    expect(r.valid).toBe(true);
  });
  test("takvimde olmayan vade reddedilir", () => {
    expect(validateDebt({ ...debtBase, dueOn: "2026-02-31" as never }).errors.dueOn).toBeTruthy();
  });
});

const payBase = {
  debtId: "d1",
  amountKurus: asKurus(50_000),
  date: asDateStr("2026-03-01"),
  note: null,
  createTransaction: false,
  accountId: null,
};

describe("validatePayment -- gecerli girdiler", () => {
  test("islemsiz odeme gecerli -- elden verildi", () => {
    expect(validatePayment(payBase).valid).toBe(true);
  });
  test("islemli odeme hesapla gecerli", () => {
    const r = validatePayment({ ...payBase, createTransaction: true, accountId: "acc-1" });
    expect(r.valid).toBe(true);
  });
});

describe("validatePayment -- ★ islem olusturulacaksa hesap zorunlu", () => {
  test("hesapsiz islem reddedilir", () => {
    const r = validatePayment({ ...payBase, createTransaction: true, accountId: null });
    expect(r.errors.accountId).toBeTruthy();
  });
  test("islem olusturulmayacaksa hesap istenmez", () => {
    const r = validatePayment({ ...payBase, createTransaction: false, accountId: null });
    expect(r.errors.accountId).toBeUndefined();
  });
});

describe("validatePayment -- ★ odeme tarihi acilistan once olamaz", () => {
  test("erken odeme reddedilir -- check_payment_date karsiligi", () => {
    const r = validatePayment(
      { ...payBase, date: asDateStr("2025-12-01") },
      { openedOn: asDateStr("2026-01-01") },
    );
    expect(r.errors.date).toBeTruthy();
  });
  test("acilis gunu odeme kabul edilir", () => {
    const r = validatePayment(
      { ...payBase, date: asDateStr("2026-01-01") },
      { openedOn: asDateStr("2026-01-01") },
    );
    expect(r.valid).toBe(true);
  });
});

describe("validatePayment -- ★ fazla odeme UYARIR ama engellemez", () => {
  test("kalandan fazla odeme gecerli sayilir", () => {
    // Faizli borc kalan anaparadan fazla odenebilir; karar
    // kullanicinin, uygulama yalnizca uyarir.
    const r = validatePayment(
      { ...payBase, amountKurus: asKurus(200_000) },
      { remainingKurus: asKurus(100_000) },
    );
    expect(r.valid).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  test("kalan kadar odemede uyari yok", () => {
    const r = validatePayment(
      { ...payBase, amountKurus: asKurus(100_000) },
      { remainingKurus: asKurus(100_000) },
    );
    expect(r.warnings).toEqual([]);
  });
  test("sifir tutar yine de reddedilir", () => {
    expect(validatePayment({ ...payBase, amountKurus: asKurus(0) }).errors.amountKurus).toBeTruthy();
  });
});
