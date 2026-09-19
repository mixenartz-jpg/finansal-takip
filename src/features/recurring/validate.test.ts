import { describe, test, expect } from "vitest";
import { validateRule } from "./types";
import { asKurus } from "@/lib/money/money";
import { asDateStr } from "@/lib/date/date";

const base = {
  name: "Kira",
  kind: "expense" as const,
  amountKurus: asKurus(500_000),
  accountId: "acc-1",
  categoryId: "cat-1",
  note: null,
  freq: "monthly" as const,
  dayOf: 5,
  monthOf: null,
  startDate: asDateStr("2026-01-01"),
  endDate: null,
};

describe("validateRule -- gecerli girdiler", () => {
  test("tam aylik kural gecerli", () => {
    expect(validateRule(base).valid).toBe(true);
  });
  test("haftalik kural gecerli", () => {
    expect(validateRule({ ...base, freq: "weekly", dayOf: 3 }).valid).toBe(true);
  });
  test("yillik kural gecerli", () => {
    expect(validateRule({ ...base, freq: "yearly", dayOf: 15, monthOf: 3 }).valid).toBe(true);
  });
  test("kategorisiz kural gecerli", () => {
    expect(validateRule({ ...base, categoryId: null }).valid).toBe(true);
  });
});

describe("validateRule -- ★ gun araligi sikliga bagli", () => {
  test("haftalikta 7'den buyuk gun reddedilir", () => {
    // weekly_day_in_range kisitinin istemci karsiligi.
    expect(validateRule({ ...base, freq: "weekly", dayOf: 25 }).errors.dayOf).toBeTruthy();
  });
  test("haftalikta 1-7 arasi kabul edilir", () => {
    for (const d of [1, 4, 7]) {
      expect(validateRule({ ...base, freq: "weekly", dayOf: d }).valid).toBe(true);
    }
  });
  test("aylikta 31'e kadar kabul edilir", () => {
    expect(validateRule({ ...base, dayOf: 31 }).valid).toBe(true);
  });
  test("aylikta 32 reddedilir", () => {
    expect(validateRule({ ...base, dayOf: 32 }).errors.dayOf).toBeTruthy();
  });
  test("sifir gun reddedilir", () => {
    expect(validateRule({ ...base, dayOf: 0 }).errors.dayOf).toBeTruthy();
  });
});

describe("validateRule -- ★ ay yalnizca yillikta", () => {
  test("yillikta ay zorunlu", () => {
    expect(validateRule({ ...base, freq: "yearly", monthOf: null }).errors.monthOf).toBeTruthy();
  });
  test("aylikta ay verilirse reddedilir", () => {
    // month_of_only_yearly kisitinin istemci karsiligi.
    expect(validateRule({ ...base, freq: "monthly", monthOf: 3 }).errors.monthOf).toBeTruthy();
  });
  test("gecersiz ay numarasi reddedilir", () => {
    expect(validateRule({ ...base, freq: "yearly", monthOf: 13 }).errors.monthOf).toBeTruthy();
  });
});

describe("validateRule -- tarih kurallari", () => {
  test("bitis baslangictan once olamaz", () => {
    const r = validateRule({
      ...base, startDate: asDateStr("2026-06-01"), endDate: asDateStr("2026-01-01"),
    });
    expect(r.errors.endDate).toBeTruthy();
  });
  test("bitis baslangicla ayni gun olabilir", () => {
    const r = validateRule({
      ...base, startDate: asDateStr("2026-06-01"), endDate: asDateStr("2026-06-01"),
    });
    expect(r.valid).toBe(true);
  });
  test("takvimde olmayan baslangic reddedilir", () => {
    expect(validateRule({ ...base, startDate: "2026-02-31" as never }).errors.startDate).toBeTruthy();
  });
  test("bos bitis tarihi gecerli -- suresiz kural", () => {
    expect(validateRule({ ...base, endDate: null }).valid).toBe(true);
  });
});

describe("validateRule -- zorunlu alanlar", () => {
  test("ad bos olamaz", () => {
    expect(validateRule({ ...base, name: "   " }).errors.name).toBeTruthy();
  });
  test("tutar sifirdan buyuk olmali", () => {
    expect(validateRule({ ...base, amountKurus: asKurus(0) }).errors.amountKurus).toBeTruthy();
  });
  test("hesap zorunlu", () => {
    expect(validateRule({ ...base, accountId: "" }).errors.accountId).toBeTruthy();
  });
  test("her hata Turkce metin tasir", () => {
    const r = validateRule({});
    for (const msg of Object.values(r.errors)) {
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});
