import { describe, expect, test } from "vitest";
import { intentToTransactionInput } from "./to-input";
import type { NamedRecord } from "./resolve";

/**
 * Niyet → `TransactionInput` çevirisi.
 *
 * Bu, asistanın mevcut `useCreateTransaction` hook'una bağlandığı
 * yer. Hook'un beklediği şekil değişirse burası kırılmalı, sessizce
 * yanlış veri üretmemeli.
 */

const cats: NamedRecord[] = [
  { id: "c-market", name: "Market" },
  { id: "c-maas", name: "Maaş" },
];
const accs: NamedRecord[] = [
  { id: "a-nakit", name: "Nakit" },
  { id: "a-banka", name: "Garanti" },
];

const base = { categories: cats, accounts: accs, defaultAccountId: "a-nakit" };

describe("intentToTransactionInput -- gider", () => {
  test("tam niyet doğru input üretir", () => {
    const r = intentToTransactionInput(
      {
        kind: "expense",
        amountKurus: 30000,
        date: "2026-09-21",
        accountName: "Nakit",
        categoryName: "Market",
        note: "haftalık alışveriş",
      },
      base,
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      kind: "expense",
      amountKurus: 30000,
      date: "2026-09-21",
      accountId: "a-nakit",
      counterAccountId: null,
      categoryId: "c-market",
      note: "haftalık alışveriş",
      voiceTranscript: null,
      // Asistan işlemleri 'voice' sayılıyor: `source` sütununun
      // check kısıtı yalnızca manual/voice/recurring/import kabul
      // ediyor ve yeni bir tür eklemek migration gerektirirdi.
      source: "voice",
    });
  });

  /** Hesap belirtilmezse varsayılan hesap kullanılır. */
  test("hesap yoksa varsayılan kullanılır", () => {
    const r = intentToTransactionInput(
      { kind: "expense", amountKurus: 5000, date: "2026-09-21" },
      base,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.accountId).toBe("a-nakit");
  });

  test("kategori yoksa null kalır", () => {
    const r = intentToTransactionInput(
      { kind: "expense", amountKurus: 5000, date: "2026-09-21" },
      base,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.categoryId).toBeNull();
  });

  test("not yoksa null", () => {
    const r = intentToTransactionInput(
      { kind: "income", amountKurus: 100, date: "2026-09-21", categoryName: "Maaş" },
      base,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.note).toBeNull();
  });
});

describe("intentToTransactionInput -- transfer", () => {
  test("transfer karşı hesabı çözümler", () => {
    const r = intentToTransactionInput(
      {
        kind: "transfer",
        amountKurus: 100000,
        date: "2026-09-21",
        accountName: "Nakit",
        counterAccountName: "Garanti",
      },
      base,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.accountId).toBe("a-nakit");
    expect(r.input.counterAccountId).toBe("a-banka");
    // Transferde kategori olmaz.
    expect(r.input.categoryId).toBeNull();
  });

  /**
   * ── TRANSFERDE KATEGORİ ATILIR ──
   *
   * Şemada `transfer_shape` kısıtı transferde kategori olmasını
   * yasaklıyor. Model yine de kategori verebilir; geçirilirse
   * veritabanı isteği reddeder ve kullanıcı ham kısıt hatası görür.
   */
  test("★ transferde model kategori verse bile atılır", () => {
    const r = intentToTransactionInput(
      {
        kind: "transfer",
        amountKurus: 100000,
        date: "2026-09-21",
        accountName: "Nakit",
        counterAccountName: "Garanti",
        categoryName: "Market",
      },
      base,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.categoryId).toBeNull();
  });

  test("transferde karşı hesap yoksa hata", () => {
    const r = intentToTransactionInput(
      { kind: "transfer", amountKurus: 100000, date: "2026-09-21", accountName: "Nakit" },
      base,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/hedef hesap/i);
  });

  /** Aynı hesaba transfer anlamsız; şemada da yasak. */
  test("★ aynı hesaba transfer reddedilir", () => {
    const r = intentToTransactionInput(
      {
        kind: "transfer",
        amountKurus: 1000,
        date: "2026-09-21",
        accountName: "Nakit",
        counterAccountName: "Nakit",
      },
      base,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/aynı hesap/i);
  });
});

describe("intentToTransactionInput -- ★ çözümlenemeyen ad", () => {
  test("uydurulmuş hesap adı hata döner", () => {
    const r = intentToTransactionInput(
      {
        kind: "expense",
        amountKurus: 5000,
        date: "2026-09-21",
        accountName: "Vakıfbank",
      },
      base,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Vakıfbank");
  });

  test("uydurulmuş kategori adı hata döner", () => {
    const r = intentToTransactionInput(
      {
        kind: "expense",
        amountKurus: 5000,
        date: "2026-09-21",
        categoryName: "Kripto",
      },
      base,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Kripto");
  });

  /**
   * Hiç hesap yoksa (yeni kullanıcı) varsayılan da yoktur.
   * Sessizce boş kimlikle devam etmek veritabanı hatası üretirdi.
   */
  test("hiç hesap yoksa anlaşılır hata", () => {
    const r = intentToTransactionInput(
      { kind: "expense", amountKurus: 5000, date: "2026-09-21" },
      { categories: [], accounts: [], defaultAccountId: null },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/hesap/i);
  });
});
