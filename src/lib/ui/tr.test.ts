import { describe, test, expect } from "vitest";
import {
  formatLongDate,
  formatMonthTitle,
  formatShortDate,
  dayWithSuffix,
  MONTHS_TR,
  WEEKDAYS_TR,
} from "./tr";
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

describe("dayWithSuffix -- Türkçe iyelik eki", () => {
  test("ünsüzle biten okunuşlar", () => {
    expect(dayWithSuffix(1)).toBe("1'i");   // bir
    expect(dayWithSuffix(5)).toBe("5'i");   // beş
    expect(dayWithSuffix(8)).toBe("8'i");   // sekiz
  });
  test("ünlüyle biten okunuşlar kaynaştırma 's' alır", () => {
    expect(dayWithSuffix(2)).toBe("2'si");   // iki
    expect(dayWithSuffix(6)).toBe("6'sı");   // altı
    expect(dayWithSuffix(7)).toBe("7'si");   // yedi
    expect(dayWithSuffix(20)).toBe("20'si"); // yirmi
  });
  test("kalın/ince ünlü uyumu", () => {
    expect(dayWithSuffix(3)).toBe("3'ü");    // üç
    expect(dayWithSuffix(4)).toBe("4'ü");    // dört
    expect(dayWithSuffix(9)).toBe("9'u");    // dokuz
    expect(dayWithSuffix(10)).toBe("10'u");  // on
    expect(dayWithSuffix(30)).toBe("30'u");  // otuz
  });
  test("iki basamaklılar son sözcüğe göre ek alır", () => {
    expect(dayWithSuffix(15)).toBe("15'i");  // on beş
    expect(dayWithSuffix(23)).toBe("23'ü");  // yirmi üç
    expect(dayWithSuffix(26)).toBe("26'sı"); // yirmi altı
  });
  test("1-31 arası her gün için ek tanımlı", () => {
    for (let d = 1; d <= 31; d++) {
      expect(dayWithSuffix(d), `gün ${d}`).toMatch(/^\d+'(i|ı|u|ü|si|sı|su|sü)$/);
    }
  });
});
