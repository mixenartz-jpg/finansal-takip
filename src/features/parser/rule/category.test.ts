import { describe, test, expect } from "vitest";
import { findCategory } from "./category";
import type { ParseCategory } from "../types";

/** Varsayılan kategori seti — 0006_seed_categories.sql ile aynı adlar. */
const CATS: ParseCategory[] = [
  { id: "inc-maas", name: "Maaş", kind: "income", keywords: [] },
  { id: "inc-ek", name: "Ek Gelir", kind: "income", keywords: [] },
  { id: "exp-yemek", name: "Yemek", kind: "expense", keywords: [] },
  { id: "exp-market", name: "Market", kind: "expense", keywords: [] },
  { id: "exp-ulasim", name: "Ulaşım", kind: "expense", keywords: [] },
  { id: "exp-fatura", name: "Fatura", kind: "expense", keywords: [] },
  { id: "exp-kira", name: "Kira", kind: "expense", keywords: [] },
];

const id = (s: string, kind: "income" | "expense" | null = "expense") =>
  findCategory(s, CATS, kind)?.categoryId ?? null;

describe("findCategory -- yerleşik sözlük", () => {
  test("yemek", () => {
    expect(id("200 tl yemek aldım")).toBe("exp-yemek");
  });
  test("markete", () => {
    expect(id("dün markete 350 lira verdim")).toBe("exp-market");
  });
  test("marka adı market kategorisine gider", () => {
    expect(id("migros tan 400 tl alışveriş")).toBe("exp-market");
  });
  test("taksi ulaşıma gider", () => {
    expect(id("yüz elli tl taksi")).toBe("exp-ulasim");
  });
  test("fatura", () => {
    expect(id("kartla 1.250,50 tl fatura ödedim")).toBe("exp-fatura");
  });
  test("elektrik faturaya gider", () => {
    expect(id("elektrik 300 tl")).toBe("exp-fatura");
  });
  test("kira", () => {
    expect(id("15 mart kira ödedim")).toBe("exp-kira");
  });
  test("maaş gelir tarafında bulunur", () => {
    expect(id("kırk bin lira maaş yattı", "income")).toBe("inc-maas");
  });
});

describe("findCategory -- tür filtresi", () => {
  test("gelir ararken gider kategorisi dönmez", () => {
    expect(id("yemek parası geldi", "income")).not.toBe("exp-yemek");
  });
  test("gider ararken gelir kategorisi dönmez", () => {
    expect(id("maaş", "expense")).not.toBe("inc-maas");
  });
});

describe("findCategory -- kullanıcı anahtar kelimeleri", () => {
  const custom: ParseCategory[] = [
    ...CATS,
    { id: "exp-gida", name: "Gıda", kind: "expense", keywords: ["migros", "manav"] },
  ];

  test("kullanıcının kendi kelimesi yerleşik sözlüğü yener", () => {
    const r = findCategory("migros tan 400 tl", custom, "expense");
    expect(r?.categoryId).toBe("exp-gida");
  });
  test("kullanıcı eşleşmesi daha yüksek güven alır", () => {
    const own = findCategory("migros tan 400 tl", custom, "expense");
    const builtin = findCategory("markete gittim", CATS, "expense");
    expect(own!.confidence).toBeGreaterThan(builtin!.confidence);
  });
});

describe("findCategory -- kategori adının kendisi", () => {
  test("kategori adı doğrudan geçerse eşleşir", () => {
    expect(id("200 tl eğlence")).toBe(null); // Eğlence bu sette yok
  });
  test("mevcut kategori adı eşleşir", () => {
    expect(id("kira 5000")).toBe("exp-kira");
  });
});

describe("findCategory -- eşleşme yok", () => {
  test("hiçbir sinyal yoksa null", () => {
    expect(id("200 tl bir şey")).toBeNull();
  });
  test("boş kategori listesinde null", () => {
    expect(findCategory("yemek aldım", [], "expense")).toBeNull();
  });
});

describe("findCategory -- büyük harf ve aksan", () => {
  test("BÜYÜK harf aynı sonucu verir", () => {
    expect(id("200 TL YEMEK ALDIM")).toBe("exp-yemek");
  });
  test("aksansız yazım aynı sonucu verir", () => {
    expect(id("yuz elli tl taksi")).toBe("exp-ulasim");
  });
});
