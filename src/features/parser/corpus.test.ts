import { describe, test, expect } from "vitest";
import { RuleTransactionParser } from "./rule/rule-parser";
import { CONFIDENCE_THRESHOLD } from "./types";
import type { ParseContext } from "./types";
import { asDateStr } from "@/lib/date/date";
import {
  CORPUS,
  CORPUS_TODAY,
  CORPUS_CATEGORIES,
  CORPUS_ACCOUNTS,
} from "./fixtures/corpus";

const parser = new RuleTransactionParser();

const ctx: ParseContext = {
  categories: CORPUS_CATEGORIES,
  accounts: CORPUS_ACCOUNTS,
  today: asDateStr(CORPUS_TODAY),
  defaultAccountId: "acc-nakit",
};

describe("altın korpus -- her cümle beklenen alanları üretir", () => {
  for (const { text, expected } of CORPUS) {
    test(`"${text}"`, async () => {
      const r = await parser.parse(text, ctx);

      if ("kind" in expected) {
        expect(r.draft.kind, "kind").toBe(expected.kind);
      }
      if ("amountKurus" in expected) {
        expect(r.draft.amountKurus, "amountKurus").toBe(expected.amountKurus);
      }
      if ("categoryId" in expected) {
        expect(r.draft.categoryId, "categoryId").toBe(expected.categoryId);
      }
      if ("date" in expected) {
        expect(r.draft.date, "date").toBe(expected.date);
      }
      if ("accountId" in expected) {
        expect(r.draft.accountId, "accountId").toBe(expected.accountId);
      }
      if (expected.lowConfidence) {
        expect(r.overall, "overall < eşik").toBeLessThan(CONFIDENCE_THRESHOLD);
      }
    });
  }
});

describe("korpus geneli -- kalite ölçütleri", () => {
  test("TAM cümlelerin en az %90'ı eşiği geçer", async () => {
    // "Tam cümle" = hem tutar hem tür bekleniyor. Yalnızca sayı
    // biçimini sınayan satırlar ("yüz elli tl") ve tutarsız
    // ifadeler ("ödememi aldım") bilinçli olarak eksiktir; onların
    // düşük güven alması DOĞRU davranış, kusur değil. Ölçütü onları
    // da sayarak kurmak, parser'ı olmayan bilgiyi uydurmaya iterdi.
    const full = CORPUS.filter(
      (c) =>
        !c.expected.lowConfidence &&
        c.expected.amountKurus != null &&
        c.expected.kind != null,
    );
    const results = await Promise.all(full.map((c) => parser.parse(c.text, ctx)));
    const passing = results.filter((r) => r.overall >= CONFIDENCE_THRESHOLD);
    const failed = full
      .filter((_, i) => results[i].overall < CONFIDENCE_THRESHOLD)
      .map((c) => c.text);
    expect(
      passing.length / full.length,
      `${passing.length}/${full.length} geçti. Kalanlar: ${failed.join(" | ")}`,
    ).toBeGreaterThanOrEqual(0.9);
  });

  test("tutar bulunan her cümlede tutar güveni yüksektir", async () => {
    // Tutar ayrıştırma parser'ın en kritik işi: yanlış tutar, yanlış
    // kategoriden çok daha pahalıdır.
    const withAmount = CORPUS.filter((c) => c.expected.amountKurus != null);
    for (const c of withAmount) {
      const r = await parser.parse(c.text, ctx);
      expect(r.confidence.amountKurus, c.text).toBeGreaterThanOrEqual(0.6);
    }
  });

  test("hiçbir cümle çökmeye yol açmaz", async () => {
    for (const { text } of CORPUS) {
      await expect(parser.parse(text, ctx)).resolves.toBeDefined();
    }
  });

  test("bulunan her tutar pozitiftir", async () => {
    for (const { text } of CORPUS) {
      const r = await parser.parse(text, ctx);
      if (r.draft.amountKurus !== null) {
        expect(r.draft.amountKurus, text).toBeGreaterThan(0);
      }
    }
  });

  test("transfer taslağında kategori atanmaz", async () => {
    // SQL `transfer_shape` kısıtı transferde category_id'yi yasaklıyor;
    // parser buna uymayan taslak üretirse kayıt veritabanında patlar.
    for (const { text, expected } of CORPUS) {
      if (expected.kind !== "transfer") continue;
      const r = await parser.parse(text, ctx);
      expect(r.draft.categoryId, text).toBeNull();
    }
  });

  test("atanan kategorinin türü işlem türüyle uyumludur", async () => {
    // `check_category_kind` trigger'ının TS tarafındaki karşılığı.
    for (const { text } of CORPUS) {
      const r = await parser.parse(text, ctx);
      if (!r.draft.categoryId || !r.draft.kind) continue;
      const cat = CORPUS_CATEGORIES.find((c) => c.id === r.draft.categoryId);
      expect(cat?.kind, text).toBe(r.draft.kind);
    }
  });

  test("her sonuç 0..1 aralığında güven taşır", async () => {
    for (const { text } of CORPUS) {
      const r = await parser.parse(text, ctx);
      expect(r.overall).toBeGreaterThanOrEqual(0);
      expect(r.overall).toBeLessThanOrEqual(1);
    }
  });
});
