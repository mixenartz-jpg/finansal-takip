import { describe, test, expect } from "vitest";
import { nextOccurrence, dueOccurrences, describeSchedule } from "./occurrence";
import type { RecurringRule } from "./types";
import { asDateStr } from "@/lib/date/date";
import { asKurus } from "@/lib/money/money";

/** Test kuralı üreteci — yalnızca ilgilenilen alanlar verilir. */
function rule(over: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    name: "Kira",
    kind: "expense",
    amountKurus: asKurus(500_000),
    accountId: "acc-1",
    categoryId: "cat-kira",
    note: null,
    freq: "monthly",
    dayOf: 1,
    monthOf: null,
    startDate: asDateStr("2026-01-01"),
    endDate: null,
    lastRunDate: null,
    pausedAt: null,
    ...over,
  };
}

describe("nextOccurrence -- aylık", () => {
  test("başlangıçtan sonraki ilk vade", () => {
    const r = rule({ freq: "monthly", dayOf: 5, startDate: asDateStr("2026-01-01") });
    expect(nextOccurrence(r, null)).toBe("2026-01-05");
  });

  test("başlangıç günü vadeden sonraysa sonraki aya geçer", () => {
    const r = rule({ freq: "monthly", dayOf: 5, startDate: asDateStr("2026-01-10") });
    expect(nextOccurrence(r, null)).toBe("2026-02-05");
  });

  test("başlangıç tam vade günündeyse o gün geçerli", () => {
    const r = rule({ freq: "monthly", dayOf: 10, startDate: asDateStr("2026-01-10") });
    expect(nextOccurrence(r, null)).toBe("2026-01-10");
  });

  test("son üretimden sonraki aya geçer", () => {
    const r = rule({ freq: "monthly", dayOf: 5 });
    expect(nextOccurrence(r, asDateStr("2026-03-05"))).toBe("2026-04-05");
  });

  test("★ 31'i olmayan ayda ayın son gününe kırpılır", () => {
    // "Her ayın 31'i" kuralı şubatta 31 Şubat üretemez.
    const r = rule({ freq: "monthly", dayOf: 31, startDate: asDateStr("2026-01-01") });
    expect(nextOccurrence(r, asDateStr("2026-01-31"))).toBe("2026-02-28");
  });

  test("★ artık yılda şubat 29'a kırpılır", () => {
    const r = rule({ freq: "monthly", dayOf: 31, startDate: asDateStr("2024-01-01") });
    expect(nextOccurrence(r, asDateStr("2024-01-31"))).toBe("2024-02-29");
  });

  test("kırpılan aydan sonra asıl güne geri döner", () => {
    // Şubat 28'e kırpıldı diye mart da 28 olmamalı — kural hâlâ "31".
    const r = rule({ freq: "monthly", dayOf: 31, startDate: asDateStr("2026-01-01") });
    expect(nextOccurrence(r, asDateStr("2026-02-28"))).toBe("2026-03-31");
  });

  test("30'u olmayan ayda kırpılır", () => {
    const r = rule({ freq: "monthly", dayOf: 30, startDate: asDateStr("2026-01-01") });
    expect(nextOccurrence(r, asDateStr("2026-01-30"))).toBe("2026-02-28");
  });

  test("yıl sınırını geçer", () => {
    const r = rule({ freq: "monthly", dayOf: 15 });
    expect(nextOccurrence(r, asDateStr("2026-12-15"))).toBe("2027-01-15");
  });
});

describe("nextOccurrence -- haftalık", () => {
  test("başlangıçtan sonraki ilk o gün", () => {
    // 2026-09-19 cumartesi. Pazartesi (1) → 2026-09-21
    const r = rule({ freq: "weekly", dayOf: 1, startDate: asDateStr("2026-09-19") });
    expect(nextOccurrence(r, null)).toBe("2026-09-21");
  });

  test("başlangıç tam o günse o gün geçerli", () => {
    // 2026-09-19 cumartesi = ISO 6
    const r = rule({ freq: "weekly", dayOf: 6, startDate: asDateStr("2026-09-19") });
    expect(nextOccurrence(r, null)).toBe("2026-09-19");
  });

  test("son üretimden yedi gün sonra", () => {
    const r = rule({ freq: "weekly", dayOf: 1 });
    expect(nextOccurrence(r, asDateStr("2026-09-21"))).toBe("2026-09-28");
  });

  test("ay sınırını geçer", () => {
    const r = rule({ freq: "weekly", dayOf: 1 });
    expect(nextOccurrence(r, asDateStr("2026-09-28"))).toBe("2026-10-05");
  });
});

describe("nextOccurrence -- yıllık", () => {
  test("başlangıçtan sonraki ilk vade", () => {
    const r = rule({
      freq: "yearly", dayOf: 15, monthOf: 3, startDate: asDateStr("2026-01-01"),
    });
    expect(nextOccurrence(r, null)).toBe("2026-03-15");
  });

  test("bu yılki vade geçtiyse gelecek yıla geçer", () => {
    const r = rule({
      freq: "yearly", dayOf: 15, monthOf: 3, startDate: asDateStr("2026-06-01"),
    });
    expect(nextOccurrence(r, null)).toBe("2027-03-15");
  });

  test("son üretimden bir yıl sonra", () => {
    const r = rule({ freq: "yearly", dayOf: 15, monthOf: 3 });
    expect(nextOccurrence(r, asDateStr("2026-03-15"))).toBe("2027-03-15");
  });

  test("★ 29 şubat yıllık kural artık olmayan yılda kırpılır", () => {
    const r = rule({
      freq: "yearly", dayOf: 29, monthOf: 2, startDate: asDateStr("2024-01-01"),
    });
    expect(nextOccurrence(r, asDateStr("2024-02-29"))).toBe("2025-02-28");
  });
});

describe("nextOccurrence -- bitiş tarihi ve duraklatma", () => {
  test("bitiş tarihinden sonra vade yok", () => {
    const r = rule({
      freq: "monthly", dayOf: 5, endDate: asDateStr("2026-03-31"),
    });
    expect(nextOccurrence(r, asDateStr("2026-03-05"))).toBeNull();
  });

  test("bitiş tarihinde hâlâ vade var", () => {
    const r = rule({
      freq: "monthly", dayOf: 5, endDate: asDateStr("2026-04-05"),
    });
    expect(nextOccurrence(r, asDateStr("2026-03-05"))).toBe("2026-04-05");
  });

  test("duraklatılmış kuralda vade yok", () => {
    const r = rule({ freq: "monthly", dayOf: 5, pausedAt: "2026-02-01T00:00:00Z" });
    expect(nextOccurrence(r, null)).toBeNull();
  });
});

describe("★ lastRunDate, startDate'ten ÇOK ÖNCEYSE kural takılmamalı", () => {
  /**
   * Gerçek senaryo: Ocak vadesi onaylandı (lastRunDate = 2026-01-01),
   * sonra kullanıcı kuralı düzenleyip başlangıcı Haziran'a çekti.
   *
   * Tek adım ilerleten bir arama Şubat'ı bulur, Şubat < Haziran
   * olduğu için "vade yok" der ve imleç bir daha asla ilerlemez:
   * kural aktif olmasına rağmen kalıcı olarak susar ve arayüzde
   * "bitti" görünür. Sessiz ve kalıcı olduğu için en kötü hata türü.
   */

  test("aylık: başlangıca kadar atlar", () => {
    const r = rule({
      freq: "monthly", dayOf: 1,
      startDate: asDateStr("2026-06-01"),
      lastRunDate: asDateStr("2026-01-01"),
    });
    expect(nextOccurrence(r, r.lastRunDate)).toBe("2026-06-01");
  });

  test("aylık: vadeler listelenmeye devam eder", () => {
    const r = rule({
      freq: "monthly", dayOf: 1,
      startDate: asDateStr("2026-06-01"),
      lastRunDate: asDateStr("2026-01-01"),
    });
    expect(dueOccurrences(r, asDateStr("2026-09-19"))).toEqual([
      "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01",
    ]);
  });

  test("haftalık: başlangıca kadar atlar", () => {
    const r = rule({
      freq: "weekly", dayOf: 1,
      startDate: asDateStr("2026-06-01"),
      lastRunDate: asDateStr("2026-01-05"),
    });
    const next = nextOccurrence(r, r.lastRunDate);
    expect(next).not.toBeNull();
    expect(next! >= "2026-06-01").toBe(true);
  });

  test("yıllık: başlangıca kadar atlar", () => {
    const r = rule({
      freq: "yearly", dayOf: 15, monthOf: 3,
      startDate: asDateStr("2030-01-01"),
      lastRunDate: asDateStr("2026-03-15"),
    });
    expect(nextOccurrence(r, r.lastRunDate)).toBe("2030-03-15");
  });

  test("atlama sırasında bitiş tarihi hâlâ saygı görür", () => {
    // Başlangıca ulaşmadan bitiş geçilmişse gerçekten vade yok.
    const r = rule({
      freq: "monthly", dayOf: 1,
      startDate: asDateStr("2026-06-01"),
      endDate: asDateStr("2026-03-01"),
      lastRunDate: asDateStr("2026-01-01"),
    });
    expect(nextOccurrence(r, r.lastRunDate)).toBeNull();
  });

  test("çok uzak başlangıçta sonsuz döngüye girmez", () => {
    const r = rule({
      freq: "monthly", dayOf: 1,
      startDate: asDateStr("2200-01-01"),
      lastRunDate: asDateStr("2026-01-01"),
    });
    // Sınıra dayanınca null döner; askıda kalmaz.
    expect(() => nextOccurrence(r, r.lastRunDate)).not.toThrow();
  });
});

describe("dueOccurrences -- bugüne kadar vadesi gelenler", () => {
  test("hiç üretilmemiş kuralda başlangıçtan bugüne tüm vadeler", () => {
    const r = rule({ freq: "monthly", dayOf: 1, startDate: asDateStr("2026-07-01") });
    expect(dueOccurrences(r, asDateStr("2026-09-19"))).toEqual([
      "2026-07-01", "2026-08-01", "2026-09-01",
    ]);
  });

  test("son üretimden bugüne olanlar", () => {
    const r = rule({
      freq: "monthly", dayOf: 1,
      startDate: asDateStr("2026-01-01"),
      lastRunDate: asDateStr("2026-07-01"),
    });
    expect(dueOccurrences(r, asDateStr("2026-09-19"))).toEqual([
      "2026-08-01", "2026-09-01",
    ]);
  });

  test("gelecekteki vade dahil edilmez", () => {
    const r = rule({
      freq: "monthly", dayOf: 25,
      startDate: asDateStr("2026-09-01"),
    });
    // Bugün 19 Eylül; 25 Eylül henüz gelmedi.
    expect(dueOccurrences(r, asDateStr("2026-09-19"))).toEqual([]);
  });

  test("bugün vade günüyse dahil edilir", () => {
    const r = rule({
      freq: "monthly", dayOf: 19,
      startDate: asDateStr("2026-09-01"),
    });
    expect(dueOccurrences(r, asDateStr("2026-09-19"))).toEqual(["2026-09-19"]);
  });

  test("duraklatılmış kuralda vade yok", () => {
    const r = rule({
      freq: "monthly", dayOf: 1,
      startDate: asDateStr("2026-01-01"),
      pausedAt: "2026-02-01T00:00:00Z",
    });
    expect(dueOccurrences(r, asDateStr("2026-09-19"))).toEqual([]);
  });

  test("bitiş tarihinden sonrası dahil edilmez", () => {
    const r = rule({
      freq: "monthly", dayOf: 1,
      startDate: asDateStr("2026-01-01"),
      lastRunDate: asDateStr("2026-06-01"),
      endDate: asDateStr("2026-08-15"),
    });
    expect(dueOccurrences(r, asDateStr("2026-09-19"))).toEqual([
      "2026-07-01", "2026-08-01",
    ]);
  });

  test("★ çok geride kalmış kuralda sonsuz döngüye girmez", () => {
    // Yıllarca açılmamış bir uygulamada bile sınırlı sayıda vade.
    const r = rule({
      freq: "weekly", dayOf: 1,
      startDate: asDateStr("2020-01-01"),
    });
    const due = dueOccurrences(r, asDateStr("2026-09-19"));
    expect(due.length).toBeGreaterThan(0);
    expect(due.length).toBeLessThanOrEqual(60);
  });

  test("haftalık vadeler yedişer gün artar", () => {
    const r = rule({
      freq: "weekly", dayOf: 1,
      startDate: asDateStr("2026-09-01"),
    });
    const due = dueOccurrences(r, asDateStr("2026-09-19"));
    expect(due).toEqual(["2026-09-07", "2026-09-14"]);
  });
});

describe("describeSchedule -- Türkçe özet", () => {
  test("aylık", () => {
    expect(describeSchedule(rule({ freq: "monthly", dayOf: 5 }))).toBe("Her ayın 5'i");
  });
  test("ayın günü doğru iyelik eki alır", () => {
    expect(describeSchedule(rule({ freq: "monthly", dayOf: 3 }))).toBe("Her ayın 3'ü");
    expect(describeSchedule(rule({ freq: "monthly", dayOf: 20 }))).toBe("Her ayın 20'si");
  });
  test("haftalık", () => {
    expect(describeSchedule(rule({ freq: "weekly", dayOf: 1 }))).toBe("Her Pazartesi");
  });
  test("yıllık", () => {
    expect(describeSchedule(rule({ freq: "yearly", dayOf: 15, monthOf: 3 }))).toBe(
      "Her yıl 15 Mart",
    );
  });
  test("ayın son günü özel ifade edilir", () => {
    expect(describeSchedule(rule({ freq: "monthly", dayOf: 31 }))).toBe(
      "Her ayın son günü",
    );
  });
});
