import { describe, test, expect } from "vitest";
import { buildTransactionCsv, csvField, csvFileName } from "./csv";
import type { Transaction } from "@/features/transactions/types";
import { asKurus } from "@/lib/money/money";
import { asDateStr } from "@/lib/date/date";

let seq = 0;
function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${seq++}`,
    kind: "expense",
    amountKurus: asKurus(12_345),
    date: asDateStr("2026-09-10"),
    accountId: "acc-1",
    counterAccountId: null,
    categoryId: "cat-1",
    note: null,
    voiceTranscript: null,
    source: "manual",
    recurringId: null,
    createdAt: "2026-09-10T10:00:00Z",
    ...over,
  };
}

const accounts = new Map([["acc-1", "Nakit"], ["acc-2", "Banka"]]);
const categories = new Map([["cat-1", "Yemek"]]);

describe("csvField -- kaçış kuralları", () => {
  test("sade metin tırnaksız kalır", () => {
    expect(csvField("Yemek")).toBe("Yemek");
  });
  test("★ ayraç içeren alan tırnaklanır", () => {
    expect(csvField("a;b")).toBe('"a;b"');
  });
  test("★ tırnak içeren alan ikiye katlanır", () => {
    expect(csvField('dedi "merhaba"')).toBe('"dedi ""merhaba"""');
  });
  test("★ satır sonu içeren alan tırnaklanır", () => {
    expect(csvField("bir\niki")).toBe('"bir\niki"');
  });
  test("★ çıplak satır başı (CR) içeren alan da tırnaklanır", () => {
    // Eski Mac biçiminden yapıştırılan metin \r taşıyabilir.
    // Tırnaklanmazsa bazı ayrıştırıcılar satırı ikiye böler.
    expect(csvField("bir\riki")).toBe('"bir\riki"');
  });
  test("★ CRLF içeren alan tırnaklanır", () => {
    expect(csvField("bir\r\niki")).toBe('"bir\r\niki"');
  });
  test("boş alan boş kalır", () => {
    expect(csvField("")).toBe("");
  });
  test("null boş alana dönüşür", () => {
    expect(csvField(null)).toBe("");
  });
  test("★ formül enjeksiyonu etkisizleştirilir", () => {
    // Excel'de "=" ile başlayan hücre FORMÜL olarak çalışır.
    // Kullanıcı açıklamasına "=cmd|..." yazıp dosyayı paylaşırsa
    // açan kişide komut çalışabilir. Öne tırnak eklemek hücreyi
    // metin yapar.
    expect(csvField("=1+1")).toBe("'=1+1");
    expect(csvField("+ekle")).toBe("'+ekle");
    expect(csvField("-eksi")).toBe("'-eksi");
    expect(csvField("@aa")).toBe("'@aa");
  });
  test("normal metin formül sanılmaz", () => {
    expect(csvField("2 + 2 eder")).toBe("2 + 2 eder");
  });
});

describe("buildTransactionCsv", () => {
  test("başlık satırı Türkçe ve noktalı virgülle ayrılmış", () => {
    // Excel-TR varsayılan ayracı NOKTALI VİRGÜL. Virgül
    // kullanılsaydı Türkçe Excel tüm satırı tek hücreye koyardı.
    const csv = buildTransactionCsv([], accounts, categories);
    const header = csv.split("\n")[0];
    expect(header).toContain("Tarih");
    expect(header).toContain("Tutar");
    expect(header.split(";").length).toBeGreaterThan(4);
  });

  test("★ BOM ile başlar -- Excel Türkçe karakterleri doğru okur", () => {
    // BOM olmadan Excel dosyayı ANSI sanır ve "Ödeme" → "Ödeme".
    const csv = buildTransactionCsv([], accounts, categories);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  test("işlem satırı üretir", () => {
    const csv = buildTransactionCsv(
      [tx({ amountKurus: asKurus(12_345) })],
      accounts,
      categories,
    );
    const rows = csv.split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("2026-09-10");
    expect(rows[1]).toContain("Yemek");
    expect(rows[1]).toContain("Nakit");
  });

  test("★ tutar TR ondalık ayracıyla yazılır", () => {
    // 12345 kuruş = 123,45 TL. Nokta kullanılsaydı Excel-TR bunu
    // 12345 sanardı.
    const csv = buildTransactionCsv([tx({ amountKurus: asKurus(12_345) })], accounts, categories);
    expect(csv).toContain("123,45");
  });

  test("★ gider negatif, gelir pozitif işaretle yazılır", () => {
    const csv = buildTransactionCsv(
      [
        tx({ kind: "expense", amountKurus: asKurus(10_000) }),
        tx({ kind: "income", amountKurus: asKurus(20_000) }),
      ],
      accounts,
      categories,
    );
    expect(csv).toContain("-100,00");
    expect(csv).toContain("200,00");
  });

  test("tür Türkçe yazılır", () => {
    const csv = buildTransactionCsv([tx({ kind: "income" })], accounts, categories);
    expect(csv).toContain("Gelir");
  });

  test("transferde hedef hesap yazılır", () => {
    const csv = buildTransactionCsv(
      [tx({ kind: "transfer", categoryId: null, counterAccountId: "acc-2" })],
      accounts,
      categories,
    );
    expect(csv).toContain("Banka");
  });

  test("kategorisiz işlemde alan boş kalır", () => {
    const csv = buildTransactionCsv([tx({ categoryId: null })], accounts, categories);
    const row = csv.split("\n")[1];
    expect(row).toContain(";;");
  });

  test("açıklamadaki ayraç satırı bozmaz", () => {
    const csv = buildTransactionCsv(
      [tx({ note: "market; kasap" })],
      accounts,
      categories,
    );
    const rows = csv.split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"market; kasap"');
  });

  test("ses transkripti sütunu yazılır", () => {
    const csv = buildTransactionCsv(
      [tx({ source: "voice", voiceTranscript: "200 tl yemek aldım" })],
      accounts,
      categories,
    );
    expect(csv).toContain("200 tl yemek aldım");
    expect(csv).toContain("Sesli");
  });

  test("satırlar CRLF ile ayrılmaz -- tek \\n kullanılır", () => {
    const csv = buildTransactionCsv([tx(), tx()], accounts, categories);
    expect(csv).not.toContain("\r");
  });
});

describe("csvFileName", () => {
  test("aynı ay içindeyse ay adıyla adlandırır", () => {
    expect(csvFileName("2026-09-01", "2026-09-30")).toBe("hesap-takip-2026-09.csv");
  });
  test("aylar farklıysa tam aralığı yazar", () => {
    expect(csvFileName("2026-08-15", "2026-09-15")).toBe(
      "hesap-takip-2026-08-15_2026-09-15.csv",
    );
  });
  test("yıl sınırını geçen aralık", () => {
    expect(csvFileName("2025-12-01", "2026-01-31")).toBe(
      "hesap-takip-2025-12-01_2026-01-31.csv",
    );
  });
  test("tek günlük aralık ay adıyla yazılır", () => {
    expect(csvFileName("2026-09-19", "2026-09-19")).toBe("hesap-takip-2026-09.csv");
  });
});
