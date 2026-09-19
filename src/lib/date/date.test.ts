import { describe, expect, it } from "vitest";
import {
  addDays,
  asDateStr,
  compareDates,
  daysInMonth,
  diffDays,
  eachDay,
  endOfIsoWeek,
  endOfMonth,
  fromParts,
  isDateStr,
  isoWeekday,
  monthDays,
  startOfIsoWeek,
  startOfMonth,
  toDateStr,
  todayStr,
  toParts,
} from "./date";
import { APP_TIMEZONE } from "./types";

const d = asDateStr;

describe("isDateStr / asDateStr", () => {
  it("geçerli tarihleri kabul eder", () => {
    expect(isDateStr("2026-08-05")).toBe(true);
    expect(isDateStr("2024-02-29")).toBe(true); // artık yıl
  });

  it("biçimsiz string'leri reddeder", () => {
    expect(isDateStr("2026-8-5")).toBe(false);
    expect(isDateStr("05.08.2026")).toBe(false);
    expect(isDateStr("")).toBe(false);
  });

  it("var olmayan takvim günlerini reddeder", () => {
    expect(isDateStr("2026-02-30")).toBe(false);
    expect(isDateStr("2025-02-29")).toBe(false); // artık yıl değil
    expect(isDateStr("2026-13-01")).toBe(false);
    expect(isDateStr("2026-04-31")).toBe(false);
  });

  it("asDateStr geçersiz girdide fırlatır", () => {
    expect(() => asDateStr("2026-02-30")).toThrow(RangeError);
  });
});

describe("toParts / fromParts", () => {
  it("gidiş-dönüş yapar", () => {
    expect(toParts(d("2026-08-05"))).toEqual({ year: 2026, month: 8, day: 5 });
    expect(fromParts(2026, 8, 5)).toBe("2026-08-05");
  });

  it("tek haneli ay ve günü sıfırla doldurur", () => {
    expect(fromParts(2026, 1, 3)).toBe("2026-01-03");
  });
});

describe("toDateStr — saat dilimi güvenliği", () => {
  // Bu testler uygulamanın 1 numaralı riskini kapsar: UTC kayması
  // yüzünden gece işaretlenen bir şeyin önceki güne düşmesi.
  it("İstanbul'da gece yarısından hemen sonra doğru günü verir", () => {
    // 2026-08-05 00:30 İstanbul = 2026-08-04 21:30 UTC
    const instant = new Date("2026-08-04T21:30:00Z");
    expect(toDateStr(instant)).toBe("2026-08-05");
    // toISOString bunu yanlış yapardı — regresyon koruması:
    expect(instant.toISOString().slice(0, 10)).toBe("2026-08-04");
  });

  it("İstanbul'da gece yarısından hemen önce doğru günü verir", () => {
    // 2026-08-04 23:30 İstanbul = 2026-08-04 20:30 UTC
    expect(toDateStr(new Date("2026-08-04T20:30:00Z"))).toBe("2026-08-04");
  });

  it("UTC gün ortasında da doğrudur", () => {
    expect(toDateStr(new Date("2026-08-05T12:00:00Z"))).toBe("2026-08-05");
  });

  it("uygulama saat dilimi Europe/Istanbul'dur", () => {
    expect(APP_TIMEZONE).toBe("Europe/Istanbul");
  });
});

describe("todayStr", () => {
  it("verilen anı uygulama saat diliminde yorumlar", () => {
    expect(todayStr(new Date("2026-08-04T21:30:00Z"))).toBe("2026-08-05");
  });

  it("geçerli bir DateStr döndürür", () => {
    expect(isDateStr(todayStr())).toBe(true);
  });
});

describe("addDays", () => {
  it("gün ekler ve çıkarır", () => {
    expect(addDays(d("2026-08-05"), 1)).toBe("2026-08-06");
    expect(addDays(d("2026-08-05"), -1)).toBe("2026-08-04");
    expect(addDays(d("2026-08-05"), 0)).toBe("2026-08-05");
  });

  it("ay sınırını aşar", () => {
    expect(addDays(d("2026-08-31"), 1)).toBe("2026-09-01");
    expect(addDays(d("2026-09-01"), -1)).toBe("2026-08-31");
  });

  it("yıl sınırını aşar", () => {
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(d("2027-01-01"), -1)).toBe("2026-12-31");
  });

  it("artık yıl 29 Şubat'ı doğru geçer", () => {
    expect(addDays(d("2024-02-28"), 1)).toBe("2024-02-29");
    expect(addDays(d("2024-02-29"), 1)).toBe("2024-03-01");
    expect(addDays(d("2025-02-28"), 1)).toBe("2025-03-01"); // artık değil
  });

  it("büyük atlamalarda doğrudur", () => {
    expect(addDays(d("2026-01-01"), 365)).toBe("2027-01-01");
    expect(addDays(d("2024-01-01"), 366)).toBe("2025-01-01"); // artık yıl
  });
});

describe("diffDays", () => {
  it("gün farkını hesaplar", () => {
    expect(diffDays(d("2026-08-06"), d("2026-08-05"))).toBe(1);
    expect(diffDays(d("2026-08-05"), d("2026-08-06"))).toBe(-1);
    expect(diffDays(d("2026-08-05"), d("2026-08-05"))).toBe(0);
  });

  it("ay ve yıl sınırlarını aşar", () => {
    expect(diffDays(d("2026-09-01"), d("2026-08-31"))).toBe(1);
    expect(diffDays(d("2027-01-01"), d("2026-12-31"))).toBe(1);
    expect(diffDays(d("2024-03-01"), d("2024-02-28"))).toBe(2); // artık yıl
  });

  it("addDays ile tutarlıdır", () => {
    const base = d("2026-03-15");
    for (const n of [-400, -31, -1, 0, 1, 31, 400]) {
      expect(diffDays(addDays(base, n), base)).toBe(n);
    }
  });
});

describe("compareDates", () => {
  it("kronolojik sıralar", () => {
    expect(compareDates(d("2026-08-05"), d("2026-08-06"))).toBe(-1);
    expect(compareDates(d("2026-08-06"), d("2026-08-05"))).toBe(1);
    expect(compareDates(d("2026-08-05"), d("2026-08-05"))).toBe(0);
  });

  it("yıl sınırında doğru sıralar", () => {
    expect(compareDates(d("2026-12-31"), d("2027-01-01"))).toBe(-1);
  });
});

describe("isoWeekday", () => {
  it("Pazartesi=1 … Pazar=7 döndürür", () => {
    // 2026-08-03 Pazartesi
    expect(isoWeekday(d("2026-08-03"))).toBe(1);
    expect(isoWeekday(d("2026-08-04"))).toBe(2);
    expect(isoWeekday(d("2026-08-05"))).toBe(3);
    expect(isoWeekday(d("2026-08-06"))).toBe(4);
    expect(isoWeekday(d("2026-08-07"))).toBe(5);
    expect(isoWeekday(d("2026-08-08"))).toBe(6);
    expect(isoWeekday(d("2026-08-09"))).toBe(7); // Pazar 7, 0 DEĞİL
  });
});

describe("daysInMonth", () => {
  it("standart ayları bilir", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("Şubat'ı artık yıla göre hesaplar", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29); // 400'e bölünen
    expect(daysInMonth(1900, 2)).toBe(28); // 100'e bölünen ama 400'e değil
  });
});

describe("monthDays", () => {
  it("ayın tüm günlerini sıralı verir", () => {
    const days = monthDays(2026, 2);
    expect(days).toHaveLength(28);
    expect(days[0]).toBe("2026-02-01");
    expect(days[27]).toBe("2026-02-28");
  });

  it("artık yıl Şubat'ında 29 gün verir", () => {
    expect(monthDays(2024, 2)).toHaveLength(29);
  });
});

describe("startOfMonth / endOfMonth", () => {
  it("ay sınırlarını bulur", () => {
    expect(startOfMonth(d("2026-08-15"))).toBe("2026-08-01");
    expect(endOfMonth(d("2026-08-15"))).toBe("2026-08-31");
    expect(endOfMonth(d("2026-02-10"))).toBe("2026-02-28");
    expect(endOfMonth(d("2024-02-10"))).toBe("2024-02-29");
  });
});

describe("startOfIsoWeek / endOfIsoWeek", () => {
  it("haftayı Pazartesi'den Pazar'a alır", () => {
    // 2026-08-05 Çarşamba
    expect(startOfIsoWeek(d("2026-08-05"))).toBe("2026-08-03");
    expect(endOfIsoWeek(d("2026-08-05"))).toBe("2026-08-09");
  });

  it("Pazartesi'de kendisini döndürür", () => {
    expect(startOfIsoWeek(d("2026-08-03"))).toBe("2026-08-03");
  });

  it("Pazar'da haftanın başına döner (Pazar hafta sonudur)", () => {
    expect(startOfIsoWeek(d("2026-08-09"))).toBe("2026-08-03");
    expect(endOfIsoWeek(d("2026-08-09"))).toBe("2026-08-09");
  });
});

describe("eachDay", () => {
  it("iki uç dahil tüm günleri verir", () => {
    expect(eachDay(d("2026-08-03"), d("2026-08-05"))).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });

  it("tek günlük aralıkta o günü verir", () => {
    expect(eachDay(d("2026-08-05"), d("2026-08-05"))).toEqual(["2026-08-05"]);
  });

  it("ters aralıkta boş dizi verir", () => {
    expect(eachDay(d("2026-08-05"), d("2026-08-03"))).toEqual([]);
  });
});
