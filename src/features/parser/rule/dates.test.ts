import { describe, test, expect } from "vitest";
import { findDate } from "./dates";
import { asDateStr, isDateStr } from "@/lib/date/date";

// Sabit "bugün": 2026-09-19, bir CUMARTESİ. Testler bu güne kilitli
// ki gerçek takvimin ilerlemesi testleri kırmasın.
const TODAY = asDateStr("2026-09-19");

const d = (s: string) => findDate(s, TODAY).date;

describe("findDate -- göreli günler", () => {
  test("bugün", () => {
    expect(d("bugün 200 tl harcadım")).toBe("2026-09-19");
  });
  test("dün", () => {
    expect(d("dün markete 350 lira verdim")).toBe("2026-09-18");
  });
  test("yarın", () => {
    expect(d("yarın kira ödeyeceğim")).toBe("2026-09-20");
  });
  test("evvelsi gün", () => {
    expect(d("evvelsi gün 100 tl")).toBe("2026-09-17");
  });
  test("önceki gün", () => {
    expect(d("önceki gün 100 tl")).toBe("2026-09-17");
  });
});

describe("findDate -- geçen hafta / ay", () => {
  test("geçen hafta yedi gün geri gider", () => {
    expect(d("geçen hafta 500 tl")).toBe("2026-09-12");
  });
  test("geçen ay bir ay geri gider", () => {
    expect(d("geçen ay kira ödedim")).toBe("2026-08-19");
  });
});

describe("findDate -- gün + ay biçimi", () => {
  test("bu yıl içinde geçmiş bir tarih", () => {
    expect(d("15 mart günü kira ödedim")).toBe("2026-03-15");
  });
  test("henüz gelmemiş ay geçen yıla düşer", () => {
    // Bugün eylül; "15 aralık" henüz gelmedi → geçen aralık.
    expect(d("15 aralık ödedim")).toBe("2025-12-15");
  });
  test("içinde bulunulan ay bu yıl kalır", () => {
    expect(d("5 eylül ödedim")).toBe("2026-09-05");
  });
});

describe("findDate -- hafta günleri", () => {
  test("geçmiş gün adı en son geçen o güne gider", () => {
    // 2026-09-19 cumartesi; "pazartesi" → 2026-09-14
    expect(d("pazartesi 200 tl")).toBe("2026-09-14");
  });
  test("bugünün adı bugünü verir", () => {
    expect(d("cumartesi 200 tl")).toBe("2026-09-19");
  });
  test("dünün adı dünü verir", () => {
    expect(d("cuma 200 tl")).toBe("2026-09-18");
  });
  test("gelecek öneki ileri gider", () => {
    expect(d("gelecek pazartesi ödeyeceğim")).toBe("2026-09-21");
  });
});

describe("findDate -- ★ takvimde olmayan tarih üretmez", () => {
  /**
   * "31 şubat" duyulduğunda 1..31 kontrolü geçer ve biçimlendirici
   * sessizce "2026-02-31" üretirdi. Markalı `DateStr` tipi bunu
   * fark etmez -- şekil doğru, değer yanlış. Üretilen her tarih
   * `isDateStr` kapısından geçebilmeli.
   */
  const invalid = [
    "31 şubat ödedim",
    "30 şubat 100 tl",
    "31 nisan 200 tl",
    "31 haziran 50 tl",
    "29 şubat 300 tl",   // 2026 artık yıl DEĞİL
  ];

  for (const text of invalid) {
    test(`"${text}" geçerli bir takvim tarihi üretir`, () => {
      const result = findDate(text, TODAY);
      expect(isDateStr(result.date), `üretilen: ${result.date}`).toBe(true);
    });
  }

  test("geçersiz gün/ay birleşiminde bugüne düşer, tarih uydurmaz", () => {
    expect(d("31 şubat ödedim")).toBe("2026-09-19");
  });

  test("geçerli artık yıl tarihi kabul edilir", () => {
    // 2024 artık yıldı; bugün 2026 olduğu için şubat geçmişte kaldı.
    expect(isDateStr(findDate("28 şubat 100 tl", TODAY).date)).toBe(true);
  });

  test("ayın son günü sınırda kabul edilir", () => {
    expect(d("30 nisan 100 tl")).toBe("2026-04-30");
    expect(d("31 mart 100 tl")).toBe("2026-03-31");
  });
});

describe("findDate -- varsayılan", () => {
  test("tarih yoksa bugün varsayılır", () => {
    expect(d("200 tl yemek aldım")).toBe("2026-09-19");
  });
  test("varsayılan olduğunda güven düşüktür", () => {
    const r = findDate("200 tl yemek aldım", TODAY);
    expect(r.confidence).toBeLessThan(0.7);
  });
  test("açık tarih yüksek güven verir", () => {
    expect(findDate("dün 200 tl", TODAY).confidence).toBeGreaterThan(0.9);
  });
});

describe("findDate -- büyük harf duyarsızlığı", () => {
  test("BÜYÜK harfli girdi aynı sonucu verir", () => {
    expect(d("DÜN 200 TL")).toBe("2026-09-18");
  });
});
