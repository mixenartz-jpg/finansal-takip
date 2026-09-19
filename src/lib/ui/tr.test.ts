import { describe, test, expect } from "vitest";
import { formatLongDate, formatMonthTitle, formatShortDate, MONTHS_TR, WEEKDAYS_TR } from "./tr";
import { asDateStr } from "@/lib/date/date";

const TODAY = asDateStr("2026-09-19");

describe("formatLongDate", () => {
  test("bugun icin 'Bugün' der -- tam tarih bilgi katmaz", () => {
    expect(formatLongDate(TODAY, TODAY)).toBe("Bugün");
  });
  test("dun icin 'Dün' der", () => {
    expect(formatLongDate(asDateStr("2026-09-18"), TODAY)).toBe("Dün");
  });
  test("ayni yil icinde yil yazilmaz", () => {
    expect(formatLongDate(asDateStr("2026-03-15"), TODAY)).toBe("15 Mart");
  });
  test("farkli yilda yil yazilir", () => {
    expect(formatLongDate(asDateStr("2025-12-15"), TODAY)).toBe("15 Aralık 2025");
  });
});

describe("formatMonthTitle", () => {
  test("ay ve yil", () => {
    expect(formatMonthTitle(asDateStr("2026-09-01"))).toBe("Eylül 2026");
  });
});

describe("formatShortDate", () => {
  test("gun ve ay sifirla doldurulur", () => {
    expect(formatShortDate(asDateStr("2026-03-05"))).toBe("05.03.2026");
  });
});

describe("dizi hizalamasi -- ISO indeksle dogrudan kullanilabilmeli", () => {
  test("MONTHS_TR[1] Ocak", () => {
    expect(MONTHS_TR[1]).toBe("Ocak");
  });
  test("MONTHS_TR[12] Aralık", () => {
    expect(MONTHS_TR[12]).toBe("Aralık");
  });
  test("WEEKDAYS_TR[1] Pazartesi -- ISO gun 1", () => {
    expect(WEEKDAYS_TR[1]).toBe("Pazartesi");
  });
  test("WEEKDAYS_TR[7] Pazar -- ISO gun 7", () => {
    expect(WEEKDAYS_TR[7]).toBe("Pazar");
  });
});
