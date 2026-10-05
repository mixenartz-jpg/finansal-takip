import { describe, expect, test } from "vitest";
import { SYSTEM_INSTRUCTION, buildContextBlock } from "./prompt";

const ctx = {
  today: "2026-09-21",
  categories: [
    { name: "Market", kind: "expense" as const },
    { name: "Maaş", kind: "income" as const },
  ],
  accounts: [
    { name: "Nakit", kind: "cash" as const },
    { name: "Garanti", kind: "bank" as const },
  ],
};

describe("SYSTEM_INSTRUCTION", () => {
  test("Türkçe cevap vermesini söyler", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/Türkçe/);
  });

  /**
   * Model uydurmaya çok yatkın: hesap adı bilmiyorsa "Vakıfbank"
   * diye bir tane icat eder ve niyet doğrulamadan geçse bile
   * kullanıcının olmayan hesabına işlem yazılmaya çalışılır.
   */
  test("uydurmamasını açıkça söyler", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/uydur/i);
  });

  /**
   * Model kimlik görmüyor. Yönerge "önce bul, sonra kimlikle sil"
   * derse model kimliği UYDURUR; araçlar artık kaydı tarifle alıyor.
   */
  test("★ güncelleme/silmede kimlik değil tarif istenir", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/kimlik/i);
    expect(SYSTEM_INSTRUCTION).toMatch(/TARİF/);
    expect(SYSTEM_INSTRUCTION).not.toMatch(/ÖNCE findTransactions/);
  });

  test("bugünün tarihine göre göreli tarih çözmesini söyler", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/bugün/i);
  });
});

describe("buildContextBlock", () => {
  test("bugünün tarihi bloğa girer", () => {
    expect(buildContextBlock(ctx)).toContain("2026-09-21");
  });

  test("kategori ve hesap ADLARI bloğa girer", () => {
    const block = buildContextBlock(ctx);
    for (const name of ["Market", "Maaş", "Nakit", "Garanti"]) {
      expect(block).toContain(name);
    }
  });

  /**
   * ── DIŞARI ÇIKAN VERİ ASGARİ ──
   *
   * Gemini'ye yalnızca ADLAR gider. Kimlikler (UUID) gitmez: modelin
   * onlara ihtiyacı yok (eşlemeyi istemci yapar) ve kimlik sızdırmak
   * gereksiz risktir. Ham işlem listesi de gitmez.
   */
  test("★ kimlik (UUID) bloğa GİRMEZ", () => {
    const withIds = {
      ...ctx,
      categories: [{ name: "Market", kind: "expense" as const }],
    };
    const block = buildContextBlock(withIds);
    expect(block).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  test("boş listelerde çökmez", () => {
    const empty = { today: "2026-09-21", categories: [], accounts: [] };
    expect(() => buildContextBlock(empty)).not.toThrow();
    expect(buildContextBlock(empty)).toContain("2026-09-21");
  });
});
