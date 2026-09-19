import { describe, test, expect } from "vitest";
import { validateTransaction, NOTE_MAX } from "./types";
import { asKurus } from "@/lib/money/money";
import { asDateStr } from "@/lib/date/date";

const base = {
  kind: "expense" as const,
  amountKurus: asKurus(20_000),
  date: asDateStr("2026-09-19"),
  accountId: "acc-1",
  counterAccountId: null,
  categoryId: "cat-1",
  note: null,
  voiceTranscript: null,
  source: "manual" as const,
};

describe("validateTransaction -- geçerli girdiler", () => {
  test("tam gider işlemi geçerli", () => {
    expect(validateTransaction(base).valid).toBe(true);
  });
  test("kategorisiz işlem geçerli -- şema category_id'ye null izin veriyor", () => {
    expect(validateTransaction({ ...base, categoryId: null }).valid).toBe(true);
  });
  test("geçerli transfer", () => {
    const r = validateTransaction({
      ...base,
      kind: "transfer",
      counterAccountId: "acc-2",
      categoryId: null,
    });
    expect(r.valid).toBe(true);
  });
});

describe("validateTransaction -- eksik alanlar", () => {
  test("tür yoksa hata", () => {
    const r = validateTransaction({ ...base, kind: undefined });
    expect(r.valid).toBe(false);
    expect(r.errors.kind).toBeTruthy();
  });
  test("tutar yoksa hata", () => {
    const r = validateTransaction({ ...base, amountKurus: undefined });
    expect(r.errors.amountKurus).toBeTruthy();
  });
  test("tarih yoksa hata", () => {
    expect(validateTransaction({ ...base, date: undefined }).errors.date).toBeTruthy();
  });
  test("hesap yoksa hata", () => {
    expect(validateTransaction({ ...base, accountId: undefined }).errors.accountId).toBeTruthy();
  });
});

describe("validateTransaction -- ★ takvim tarihi doğrulaması", () => {
  test("takvimde olmayan tarih reddedilir", () => {
    // Markalı tip derleme zamanında korur ama "2026-02-31" şekil
    // olarak doğru; çalışma zamanı savunması gerekir.
    const r = validateTransaction({ ...base, date: "2026-02-31" as never });
    expect(r.valid).toBe(false);
    expect(r.errors.date).toBeTruthy();
  });
  test("artık yıl olmayan yılda 29 şubat reddedilir", () => {
    expect(validateTransaction({ ...base, date: "2026-02-29" as never }).errors.date).toBeTruthy();
  });
  test("bozuk biçimli tarih reddedilir", () => {
    expect(validateTransaction({ ...base, date: "19-09-2026" as never }).errors.date).toBeTruthy();
  });
  test("geçerli tarih kabul edilir", () => {
    expect(validateTransaction({ ...base, date: asDateStr("2026-02-28") }).valid).toBe(true);
  });
  test("geçerli artık yıl tarihi kabul edilir", () => {
    expect(validateTransaction({ ...base, date: asDateStr("2024-02-29") }).valid).toBe(true);
  });
});

describe("validateTransaction -- tutar kuralları", () => {
  test("sıfır tutar reddedilir -- SQL check (amount_kurus > 0) karşılığı", () => {
    expect(validateTransaction({ ...base, amountKurus: asKurus(0) }).errors.amountKurus).toBeTruthy();
  });
  test("negatif tutar reddedilir -- işaret kind'dan türetilir", () => {
    expect(validateTransaction({ ...base, amountKurus: asKurus(-100) }).errors.amountKurus).toBeTruthy();
  });
});

describe("validateTransaction -- transfer kuralları (transfer_shape karşılığı)", () => {
  test("hedef hesapsız transfer reddedilir", () => {
    const r = validateTransaction({ ...base, kind: "transfer", categoryId: null });
    expect(r.errors.counterAccountId).toBeTruthy();
  });
  test("aynı hesaba transfer reddedilir", () => {
    const r = validateTransaction({
      ...base, kind: "transfer", counterAccountId: "acc-1", categoryId: null,
    });
    expect(r.errors.counterAccountId).toBeTruthy();
  });
  test("kategorili transfer reddedilir", () => {
    const r = validateTransaction({
      ...base, kind: "transfer", counterAccountId: "acc-2", categoryId: "cat-1",
    });
    expect(r.errors.categoryId).toBeTruthy();
  });
  test("gelir/giderde hedef hesap istenmez", () => {
    expect(validateTransaction(base).errors.counterAccountId).toBeUndefined();
  });
});

describe("validateTransaction -- açıklama sınırı", () => {
  test("sınır içindeki açıklama geçerli", () => {
    expect(validateTransaction({ ...base, note: "a".repeat(NOTE_MAX) }).valid).toBe(true);
  });
  test("sınırı aşan açıklama reddedilir -- SQL check karşılığı", () => {
    const r = validateTransaction({ ...base, note: "a".repeat(NOTE_MAX + 1) });
    expect(r.errors.note).toBeTruthy();
  });
});

describe("validateTransaction -- hata mesajları Türkçe ve eyleme dönük", () => {
  test("her hata boş olmayan Türkçe metin taşır", () => {
    const r = validateTransaction({});
    for (const msg of Object.values(r.errors)) {
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).toMatch(/[a-zğüşıöç]/i);
    }
  });
});
