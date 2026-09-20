import { describe, test, expect } from "vitest";
import { validateTransactionPatch, toPatchRow } from "./types";
import { asKurus } from "@/lib/money/money";
import { asDateStr } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";

const base = {
  kind: "expense" as const,
  amountKurus: asKurus(20_000),
  date: asDateStr("2026-09-20"),
  accountId: "acc-1",
  counterAccountId: null,
  categoryId: "cat-1",
  note: null,
};

describe("validateTransactionPatch", () => {
  test("geçerli yamayı kabul eder", () => {
    expect(validateTransactionPatch(base).valid).toBe(true);
  });

  test("sıfır tutarı reddeder", () => {
    const r = validateTransactionPatch({ ...base, amountKurus: asKurus(0) });
    expect(r.valid).toBe(false);
    expect(r.errors.amountKurus).toBe("Tutar sıfırdan büyük olmalı.");
  });

  test("transferde hedef hesap kaynakla aynı olamaz", () => {
    const r = validateTransactionPatch({
      ...base,
      kind: "transfer",
      categoryId: null,
      counterAccountId: "acc-1",
    });
    expect(r.valid).toBe(false);
    expect(r.errors.counterAccountId).toBe(
      "Hedef hesap kaynak hesaptan farklı olmalı.",
    );
  });

  test("takvimde olmayan tarihi reddeder", () => {
    // `asDateStr` bunu fırlatırdı; markalı tip ŞEKLİ korur, DEĞERİ
    // değil. Doğrulayıcının çalışma zamanı savunması test ediliyor.
    const r = validateTransactionPatch({ ...base, date: "2026-02-31" as DateStr });
    expect(r.valid).toBe(false);
  });
});

describe("toPatchRow", () => {
  test("camelCase alanları snake_case sütunlara çevirir", () => {
    expect(toPatchRow(base)).toEqual({
      kind: "expense",
      amount_kurus: 20_000,
      date: "2026-09-20",
      account_id: "acc-1",
      counter_account_id: null,
      category_id: "cat-1",
      note: null,
    });
  });

  test("source ve voice_transcript'i DEĞİŞTİRMEZ", () => {
    // Bir işlemin sesle eklendiği bilgisi ve ham transkripti
    // düzenlemeyle kaybolmamalı: parser'ı geliştirmek için tutulan
    // gerçek korpus budur.
    const row = toPatchRow(base);
    expect(row).not.toHaveProperty("source");
    expect(row).not.toHaveProperty("voice_transcript");
  });
});
