import { describe, test, expect } from "vitest";
import { classifyIntent } from "./intent";

/** Kısaltma: yalnızca türü döndürür. */
const kind = (s: string) => classifyIntent(s).kind;

describe("classifyIntent -- açık gider sinyalleri", () => {
  test("ödedim", () => {
    expect(kind("200 tl fatura ödedim")).toBe("expense");
  });
  test("harcadım", () => {
    expect(kind("markete 350 lira harcadım")).toBe("expense");
  });
  test("verdim", () => {
    expect(kind("dün markete 350 lira verdim")).toBe("expense");
  });
  test("satın aldım", () => {
    expect(kind("500 tl ayakkabı satın aldım")).toBe("expense");
  });
});

describe("classifyIntent -- açık gelir sinyalleri", () => {
  test("geldi", () => {
    expect(kind("bugün 40.000 tl para geldi")).toBe("income");
  });
  test("yattı", () => {
    expect(kind("kırk bin lira maaş yattı")).toBe("income");
  });
  test("kazandım", () => {
    expect(kind("5000 tl kazandım")).toBe("income");
  });
  test("hesabıma girdi", () => {
    expect(kind("15 bin tl hesabıma girdi")).toBe("income");
  });
  test("tahsil ettim", () => {
    expect(kind("2000 tl tahsil ettim")).toBe("income");
  });
});

describe("classifyIntent -- ★ 'aldım' belirsizliği", () => {
  test("nesne bir mal ise GİDER: yemek aldım", () => {
    expect(kind("200 tl yemek aldım")).toBe("expense");
  });
  test("nesne bir mal ise GİDER: kitap aldım", () => {
    expect(kind("150 lira kitap aldım")).toBe("expense");
  });
  test("nesne maaş ise GELİR", () => {
    expect(kind("maaşımı aldım")).toBe("income");
  });
  test("nesne para ise GELİR", () => {
    expect(kind("40 bin tl para aldım")).toBe("income");
  });
  test("nesne ödeme ise GELİR", () => {
    expect(kind("ödememi aldım")).toBe("income");
  });
  test("nesne alacak ise GELİR", () => {
    expect(kind("alacağımı aldım")).toBe("income");
  });
  test("nesne avans ise GELİR", () => {
    expect(kind("avansımı aldım")).toBe("income");
  });
});

describe("classifyIntent -- transfer", () => {
  test("havale", () => {
    expect(kind("1000 tl havale yaptım")).toBe("transfer");
  });
  test("aktardım", () => {
    expect(kind("5000 tl aktardım")).toBe("transfer");
  });
  test("atm den nakit çektim", () => {
    expect(kind("500 tl atm den çektim")).toBe("transfer");
  });
});

describe("classifyIntent -- kararsızlık", () => {
  test("yalın 'aldım' nesnesiz: kind null, uydurmaz", () => {
    const r = classifyIntent("aldım");
    expect(r.kind).toBeNull();
    expect(r.confidence).toBeLessThan(0.5);
  });
  test("hiç sinyal yoksa null", () => {
    const r = classifyIntent("bugün hava çok güzel");
    expect(r.kind).toBeNull();
  });
  test("belirsiz durumda uyarı üretir", () => {
    const r = classifyIntent("aldım");
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("classifyIntent -- güven skoru", () => {
  test("güçlü sinyal yüksek güven verir", () => {
    expect(classifyIntent("40.000 tl para geldi").confidence).toBeGreaterThan(0.7);
  });
  test("belirsiz cümle düşük güven verir", () => {
    expect(classifyIntent("aldım").confidence).toBeLessThan(0.5);
  });
  test("güven her zaman 0..1 aralığında", () => {
    for (const s of ["200 tl yemek aldım", "maaş yattı", "aldım", "hava güzel"]) {
      const c = classifyIntent(s).confidence;
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe("classifyIntent -- büyük harf ve aksan duyarsızlığı", () => {
  test("büyük harfli girdi aynı sonucu verir", () => {
    expect(kind("200 TL YEMEK ALDIM")).toBe("expense");
  });
  test("aksansız yazım aynı sonucu verir", () => {
    expect(kind("kirk bin lira maas yatti")).toBe("income");
  });
});
