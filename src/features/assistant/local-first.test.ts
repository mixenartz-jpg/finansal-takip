import { describe, expect, test } from "vitest";
import { draftToIntent } from "./local-first";
import { EMPTY_DRAFT, ZERO_CONFIDENCE, CONFIDENCE_THRESHOLD } from "@/features/parser/types";
import type { ParseResult } from "@/features/parser/types";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";

/**
 * Kural motoru sonucunu niyete çevirme.
 *
 * ── NEDEN ÖNCE KURAL MOTORU ──
 *
 * Kural motoru ücretsiz, anlık ve çevrimdışı. "200 tl yemek aldım"
 * gibi cümlelerde Gemini'ye hiç gitmeye gerek yok: hem günlük kota
 * korunur hem kullanıcı ağ gecikmesi beklemez.
 *
 * Gemini yalnızca kural motorunun zorlandığı cümlelerde devreye
 * girer — zaten `ChainedParser`'ın yıllardır yaptığı şey, burada
 * sohbet yoluna taşınıyor.
 */

const cats = [{ id: "c1", name: "Yemek" }];
const accs = [{ id: "a1", name: "Nakit" }];
const ctx = { categories: cats, accounts: accs, defaultAccountId: "a1" };

/** Verilen alanlarla yüksek güvenli bir sonuç kurar. */
function result(over: Partial<ParseResult>): ParseResult {
  return {
    draft: EMPTY_DRAFT,
    confidence: ZERO_CONFIDENCE,
    overall: 0.9,
    spans: {},
    warnings: [],
    parserName: "rule",
    ...over,
  };
}

const goodDraft = {
  ...EMPTY_DRAFT,
  kind: "expense" as const,
  amountKurus: 20000 as Kurus,
  date: "2026-09-21" as DateStr,
  categoryId: "c1",
  accountId: "a1",
};

describe("draftToIntent -- yüksek güven", () => {
  test("eksiksiz taslak niyete çevrilir", () => {
    const i = draftToIntent(result({ draft: goodDraft }), ctx);
    expect(i).not.toBeNull();
    expect(i?.name).toBe("createTransaction");
    expect(i?.needsConfirm).toBe(true);
    expect(i?.args).toMatchObject({
      kind: "expense",
      amountKurus: 20000,
      date: "2026-09-21",
    });
  });

  /**
   * Kimlikler ADLARA çevrilmeli: `ActionCard` ve `to-input` ad
   * bekliyor. UUID gösteren bir onay kartı kullanıcıya hiçbir şey
   * anlatmaz.
   */
  test("★ kimlikler ADLARA çevrilir", () => {
    const i = draftToIntent(result({ draft: goodDraft }), ctx);
    expect(i?.args.categoryName).toBe("Yemek");
    expect(i?.args.accountName).toBe("Nakit");
    // Kimlik argümanlara SIZMAMALI.
    expect(i?.args).not.toHaveProperty("categoryId");
    expect(i?.args).not.toHaveProperty("accountId");
  });

  test("not varsa taşınır", () => {
    const i = draftToIntent(result({ draft: { ...goodDraft, note: "öğle" } }), ctx);
    expect(i?.args.note).toBe("öğle");
  });

  test("transfer karşı hesabı ada çevirir", () => {
    const two = {
      ...ctx,
      accounts: [
        { id: "a1", name: "Nakit" },
        { id: "a2", name: "Garanti" },
      ],
    };
    const i = draftToIntent(
      result({
        draft: {
          ...goodDraft,
          kind: "transfer",
          categoryId: null,
          counterAccountId: "a2",
        },
      }),
      two,
    );
    expect(i?.args.kind).toBe("transfer");
    expect(i?.args.counterAccountName).toBe("Garanti");
  });
});

describe("draftToIntent -- ★ Gemini'ye devredilmesi gereken durumlar", () => {
  /**
   * Eşiğin altındaki sonuç Gemini'ye gitmeli: kural motoru emin
   * değilse onun tahminini onay kartına koymak, kullanıcıyı yanlış
   * veriyi onaylamaya davet eder.
   */
  test("güven eşiğin altındaysa null", () => {
    const i = draftToIntent(
      result({ draft: goodDraft, overall: CONFIDENCE_THRESHOLD - 0.01 }),
      ctx,
    );
    expect(i).toBeNull();
  });

  test("tür bulunamadıysa null", () => {
    const i = draftToIntent(result({ draft: { ...goodDraft, kind: null } }), ctx);
    expect(i).toBeNull();
  });

  test("tutar bulunamadıysa null", () => {
    const i = draftToIntent(result({ draft: { ...goodDraft, amountKurus: null } }), ctx);
    expect(i).toBeNull();
  });

  test("tarih bulunamadıysa null", () => {
    const i = draftToIntent(result({ draft: { ...goodDraft, date: null } }), ctx);
    expect(i).toBeNull();
  });

  /**
   * "Bu ay ne harcadım" gibi SORULAR kural motorunun işi değil:
   * taslak boş döner ve soru Gemini'ye gitmeli.
   */
  test("boş taslak null (soru cümlesi)", () => {
    const i = draftToIntent(result({ draft: EMPTY_DRAFT, overall: 0.9 }), ctx);
    expect(i).toBeNull();
  });

  /**
   * Transferde karşı hesap yoksa şema kısıtı reddeder. Kural
   * motoru bunu üretebilir; Gemini'ye devretmek daha iyi.
   */
  test("transferde karşı hesap yoksa null", () => {
    const i = draftToIntent(
      result({ draft: { ...goodDraft, kind: "transfer", counterAccountId: null } }),
      ctx,
    );
    expect(i).toBeNull();
  });

  /** Kimlik listede yoksa (veri değişmiş) ada çevrilemez. */
  test("tanınmayan kategori kimliği null", () => {
    const i = draftToIntent(result({ draft: { ...goodDraft, categoryId: "silinmis" } }), ctx);
    expect(i).toBeNull();
  });
});
