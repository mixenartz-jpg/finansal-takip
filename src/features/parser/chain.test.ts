import { describe, test, expect } from "vitest";
import { ChainedParser, createParser } from "./index";
import type { TransactionParser, ParseContext, ParseResult } from "./types";
import { EMPTY_DRAFT, ZERO_CONFIDENCE } from "./types";
import { asDateStr } from "@/lib/date/date";
import { CORPUS_CATEGORIES, CORPUS_ACCOUNTS, CORPUS_TODAY } from "./fixtures/corpus";

const ctx: ParseContext = {
  categories: CORPUS_CATEGORIES,
  accounts: CORPUS_ACCOUNTS,
  today: asDateStr(CORPUS_TODAY),
  defaultAccountId: "acc-nakit",
};

/** Sabit güvenle sonuç döndüren sahte parser. */
function stubParser(name: string, overall: number): TransactionParser {
  return {
    name,
    async parse(): Promise<ParseResult> {
      return {
        draft: { ...EMPTY_DRAFT },
        confidence: { ...ZERO_CONFIDENCE },
        overall,
        spans: {},
        warnings: [],
        parserName: name,
      };
    },
  };
}

/** Her zaman patlayan sahte parser — ağ hatası benzetimi. */
const explodingParser: TransactionParser = {
  name: "patlayan",
  async parse(): Promise<ParseResult> {
    throw new Error("ağ hatası");
  },
};

describe("ChainedParser -- yedeğe düşme kuralları", () => {
  test("birincil güveni yeterliyse yedek HİÇ çağrılmaz", async () => {
    let fallbackCalled = false;
    const fallback: TransactionParser = {
      name: "yedek",
      async parse() {
        fallbackCalled = true;
        return stubParser("yedek", 0.99).parse("", ctx);
      },
    };
    const chain = new ChainedParser(stubParser("ana", 0.9), fallback, 0.6);
    const r = await chain.parse("herhangi", ctx);

    expect(fallbackCalled, "yedek çağrılmamalı").toBe(false);
    expect(r.parserName).toBe("ana");
  });

  test("birincil güveni düşükse yedek çağrılır", async () => {
    const chain = new ChainedParser(stubParser("ana", 0.2), stubParser("yedek", 0.9), 0.6);
    const r = await chain.parse("herhangi", ctx);
    expect(r.parserName).toBe("yedek");
  });

  test("yedek daha kötüyse birincil sonuç korunur", async () => {
    // LLM'in daha kötü tahmin üretmesi mümkün; körlemesine ona
    // geçmek kural motorunun kesinliğini boşa harcardı.
    const chain = new ChainedParser(stubParser("ana", 0.5), stubParser("yedek", 0.1), 0.6);
    const r = await chain.parse("herhangi", ctx);
    expect(r.parserName).toBe("ana");
  });

  test("yedek yoksa birincil sonuç düşük güvenle de dönülür", async () => {
    const chain = new ChainedParser(stubParser("ana", 0.1), null, 0.6);
    const r = await chain.parse("herhangi", ctx);
    expect(r.parserName).toBe("ana");
    expect(r.overall).toBe(0.1);
  });
});

describe("ChainedParser -- yedek hata verirse dikte çalışmaya devam eder", () => {
  test("yedek patlasa bile sonuç döner, hata dışarı sızmaz", async () => {
    const chain = new ChainedParser(stubParser("ana", 0.2), explodingParser, 0.6);
    const r = await chain.parse("herhangi", ctx);
    expect(r.parserName).toBe("ana");
  });

  test("yedek patladığında kullanıcıya uyarı gösterilir", async () => {
    const chain = new ChainedParser(stubParser("ana", 0.2), explodingParser, 0.6);
    const r = await chain.parse("herhangi", ctx);
    expect(r.warnings.some((w) => w.includes("Yapay zeka"))).toBe(true);
  });
});

describe("createParser -- varsayılan kurulum", () => {
  test("yedeksiz kurulur ve kural motoruyla çalışır", async () => {
    const parser = createParser();
    const r = await parser.parse("200 tl yemek aldım", ctx);
    expect(r.draft.kind).toBe("expense");
    expect(r.draft.amountKurus).toBe(20_000);
    expect(r.parserName).toBe("rule");
  });

  test("yedek verilerek kurulabilir -- Gemini bu şekilde takılacak", async () => {
    const parser = createParser({ fallback: stubParser("gemini", 0.99) });
    // Kural motorunun çözemediği cümle → yedeğe düşer.
    const r = await parser.parse("aldım", ctx);
    expect(r.parserName).toBe("gemini");
  });
});
