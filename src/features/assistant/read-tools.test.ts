import { describe, expect, test } from "vitest";
import { runReadTool, type ReadToolData } from "./read-tools";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";

/**
 * Okuma araçlarının çalıştırılması.
 *
 * ── NEDEN ÖZET, HAM LİSTE DEĞİL ──
 *
 * Gemini'ye ham işlem listesi göndermek iki bedel getirir: token
 * maliyeti ve gereksiz veri paylaşımı. Kullanıcının 400 işlemi
 * varsa modelin hepsini görmesi gerekmiyor — "bu ay yemeğe ne
 * harcadım" sorusunun cevabı tek bir toplam.
 *
 * ── NEDEN KİMLİK GİTMEZ ──
 *
 * Sonuçta UUID yok. Model kimliklere bakarak bir şey yapamaz
 * (yazma yolu istemcide, kullanıcının RLS kapsamında) ve kimlik
 * sızdırmanın hiçbir karşılığı yok.
 */

const data: ReadToolData = {
  accounts: [
    { name: "Nakit", kind: "cash", balanceKurus: 50000 as Kurus },
    { name: "Garanti", kind: "bank", balanceKurus: 1250000 as Kurus },
  ],
  transactions: [
    {
      kind: "expense",
      amountKurus: 30000 as Kurus,
      date: "2026-10-02" as DateStr,
      categoryName: "Market",
      note: "haftalık",
    },
    {
      kind: "expense",
      amountKurus: 12000 as Kurus,
      date: "2026-10-03" as DateStr,
      categoryName: "Ulaşım",
      note: null,
    },
    {
      kind: "income",
      amountKurus: 4000000 as Kurus,
      date: "2026-10-01" as DateStr,
      categoryName: "Maaş",
      note: null,
    },
    {
      kind: "expense",
      amountKurus: 99900 as Kurus,
      date: "2026-09-15" as DateStr,
      categoryName: "Market",
      note: "eski ay",
    },
  ],
  budgets: [
    { categoryName: "Market", limitKurus: 200000 as Kurus, spentKurus: 30000 as Kurus },
  ],
  debts: [
    {
      counterparty: "Ali",
      direction: "payable",
      principalKurus: 500000 as Kurus,
      remainingKurus: 200000 as Kurus,
    },
  ],
};

describe("runReadTool -- getBalances", () => {
  test("hesap adı ve bakiye döner", () => {
    const out = runReadTool("getBalances", {}, data);
    expect(out).toContain("Nakit");
    expect(out).toContain("Garanti");
    // Tutarlar okunur biçimde.
    expect(out).toMatch(/500|12\.500/);
  });

  /** Kimlik hiçbir çıktıda görünmemeli. */
  test("★ UUID sızmaz", () => {
    const out = runReadTool("getBalances", {}, data);
    expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});

describe("runReadTool -- getSpending", () => {
  test("tarih aralığındaki gideri kategoriye göre toplar", () => {
    const out = runReadTool("getSpending", { from: "2026-10-01", to: "2026-10-31" }, data);
    expect(out).toContain("Market");
    expect(out).toContain("Ulaşım");
    // Eylül kaydı aralık dışında — toplama girmemeli.
    expect(out).not.toContain("eski ay");
  });

  /**
   * ── ARALIK SINIRI ──
   *
   * Eylül işlemi Ekim sorgusuna karışırsa kullanıcı yanlış toplam
   * görür ve sebebini hiç anlamaz.
   */
  test("★ aralık dışı işlem toplama girmez", () => {
    const out = runReadTool("getSpending", { from: "2026-10-01", to: "2026-10-31" }, data);
    // Ekim Market toplamı 300,00 TL; Eylül'ün 999 TL'si eklenmemeli.
    expect(out).toMatch(/300/);
    expect(out).not.toMatch(/1\.299/);
  });

  test("kategori filtresi uygulanır", () => {
    const out = runReadTool(
      "getSpending",
      { from: "2026-10-01", to: "2026-10-31", categoryName: "Market" },
      data,
    );
    expect(out).toContain("Market");
    expect(out).not.toContain("Ulaşım");
  });

  test("gelir gidere karışmaz", () => {
    const out = runReadTool("getSpending", { from: "2026-10-01", to: "2026-10-31" }, data);
    expect(out).not.toContain("Maaş");
  });

  test("eşleşme yoksa anlaşılır metin döner", () => {
    const out = runReadTool("getSpending", { from: "2020-01-01", to: "2020-12-31" }, data);
    expect(out).toMatch(/harcama yok|kayıt yok/i);
  });
});

describe("runReadTool -- getBudgetStatus", () => {
  test("limit ve harcanan döner", () => {
    const out = runReadTool("getBudgetStatus", {}, data);
    expect(out).toContain("Market");
    expect(out).toMatch(/2\.000|200/);
  });

  test("bütçe yoksa söyler", () => {
    const out = runReadTool("getBudgetStatus", {}, { ...data, budgets: [] });
    expect(out).toMatch(/bütçe/i);
  });
});

describe("runReadTool -- getDebts", () => {
  test("borç ve kalan tutar döner", () => {
    const out = runReadTool("getDebts", {}, data);
    expect(out).toContain("Ali");
    expect(out).toMatch(/2\.000|borçlu/i);
  });

  test("borç yoksa söyler", () => {
    const out = runReadTool("getDebts", {}, { ...data, debts: [] });
    expect(out).toMatch(/borç yok/i);
  });
});

describe("runReadTool -- findTransactions", () => {
  test("aralıktaki işlemleri listeler", () => {
    const out = runReadTool("findTransactions", { from: "2026-10-01", to: "2026-10-31" }, data);
    expect(out).toContain("Market");
    expect(out).toContain("2026-10-02");
  });

  /**
   * Sonuç çok genişse liste kesilir: 400 işlemi modele göndermek
   * hem token yakar hem cevabı bozar.
   */
  test("★ uzun liste kesilir ve toplam sayı söylenir", () => {
    const many: ReadToolData = {
      ...data,
      transactions: Array.from({ length: 60 }, (_, i) => ({
        kind: "expense" as const,
        amountKurus: 1000 as Kurus,
        date: "2026-10-10" as DateStr,
        categoryName: "Market",
        note: `kayit-${i}`,
      })),
    };
    const out = runReadTool("findTransactions", { from: "2026-10-01", to: "2026-10-31" }, many);
    expect(out).toContain("60");
    // İlk kayıtlar var, hepsi değil.
    expect(out).toContain("kayit-0");
    expect(out).not.toContain("kayit-59");
  });
});

describe("runReadTool -- tanınmayan araç", () => {
  test("yazma aracı burada çalıştırılmaz", () => {
    expect(runReadTool("createTransaction", {}, data)).toBeNull();
    expect(runReadTool("dropTables", {}, data)).toBeNull();
  });
});
