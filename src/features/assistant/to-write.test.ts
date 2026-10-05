import { describe, expect, test } from "vitest";
import {
  intentToAccountInput,
  intentToCategoryInput,
  intentToBudgetInput,
  intentToDebtInput,
  intentToRecurringInput,
  resolveTargetId,
} from "./to-write";
import type { NamedRecord } from "./resolve";

/**
 * Niyet → mutation girdisi çevirileri (yazma araçları).
 *
 * ── NEDEN HER ARAÇ İÇİN AYRI TEST ──
 *
 * Araç şemasındaki ad ile hook'un beklediği alan adı AYNI DEĞİL.
 * `createDebt` aracı `amountKurus` diyor, `DebtInput` ise
 * `principalKurus` istiyor; şemada olmayan `openedOn` zorunlu.
 * Bu uyumsuzluklar derleyiciden geçmez ama çalışma zamanında
 * sessizce yanlış veri üretir — testler o farkı kilitliyor.
 */

const cats: NamedRecord[] = [
  { id: "c-market", name: "Market" },
  { id: "c-maas", name: "Maaş" },
];
const accs: NamedRecord[] = [{ id: "a-nakit", name: "Nakit" }];
const TODAY = "2026-10-05";

describe("intentToAccountInput", () => {
  test("hesap girdisi üretir", () => {
    const r = intentToAccountInput({ name: "Yeni Kart", kind: "credit_card" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      name: "Yeni Kart",
      kind: "credit_card",
      openingKurus: 0,
      creditLimitKurus: null,
    });
  });

  /** Kredi kartında açılış bakiyesi NEGATİF olabilir (borç). */
  test("★ negatif açılış bakiyesi korunur", () => {
    const r = intentToAccountInput({
      name: "Kart",
      kind: "credit_card",
      openingKurus: -250000,
      creditLimitKurus: 1000000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.openingKurus).toBe(-250000);
    expect(r.input.creditLimitKurus).toBe(1000000);
  });

  /**
   * Şemada `credit_limit_only_on_card` kısıtı var: nakit/banka
   * hesabına limit konamaz. Geçirilirse ham Postgres hatası çıkar.
   */
  test("★ kredi kartı olmayan hesapta limit REDDEDİLİR", () => {
    const r = intentToAccountInput({
      name: "Nakit 2",
      kind: "cash",
      creditLimitKurus: 500000,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/kredi kartı/i);
  });
});

describe("intentToCategoryInput", () => {
  test("kategori girdisi üretir", () => {
    const r = intentToCategoryInput({
      name: "Ulaşım",
      kind: "expense",
      keywords: ["otobüs", "metro"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      name: "Ulaşım",
      kind: "expense",
      keywords: ["otobüs", "metro"],
    });
  });

  test("anahtar kelime yoksa boş dizi", () => {
    const r = intentToCategoryInput({ name: "Ulaşım", kind: "expense" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.keywords).toEqual([]);
  });
});

describe("intentToBudgetInput", () => {
  test("ay verilmezse bu ayın 1'i kullanılır", () => {
    const r = intentToBudgetInput({ categoryName: "Market", limitKurus: 200000 }, cats, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.categoryId).toBe("c-market");
    expect(r.input.limitKurus).toBe(200000);
    // Şemada `extract(day from month) = 1` kısıtı var.
    expect(r.input.month).toBe("2026-10-01");
  });

  /** Şema ayın 1'ini zorunlu kılıyor: 'YYYY-MM' → 'YYYY-MM-01'. */
  test("★ verilen ay ayın 1'ine normalleştirilir", () => {
    const r = intentToBudgetInput(
      { categoryName: "Market", limitKurus: 100, month: "2026-12" },
      cats,
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.month).toBe("2026-12-01");
  });

  test("bulunamayan kategori hata döner", () => {
    const r = intentToBudgetInput({ categoryName: "Kripto", limitKurus: 100 }, cats, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Kripto");
  });

  /**
   * Bütçe YALNIZCA gider kategorisine konabilir
   * (`check_budget_category_kind` trigger'ı, 0006).
   */
  test("★ gelir kategorisine bütçe REDDEDİLİR", () => {
    const withKind = [
      { id: "c-market", name: "Market", kind: "expense" as const },
      { id: "c-maas", name: "Maaş", kind: "income" as const },
    ];
    const r = intentToBudgetInput({ categoryName: "Maaş", limitKurus: 100 }, withKind, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/gider/i);
  });
});

describe("intentToDebtInput", () => {
  /**
   * ── ALAN ADI UYUMSUZLUĞU ──
   *
   * Araç şeması `amountKurus` diyor, `DebtInput` `principalKurus`
   * istiyor. Ayrıca şemada olmayan `openedOn` zorunlu: bugüne
   * düşürülüyor.
   */
  test("★ amountKurus → principalKurus, openedOn bugüne düşer", () => {
    const r = intentToDebtInput(
      { counterparty: "Ali", direction: "payable", amountKurus: 500000 },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      direction: "payable",
      counterparty: "Ali",
      principalKurus: 500000,
      openedOn: TODAY,
      dueOn: null,
      note: null,
    });
  });

  test("vade verilirse taşınır", () => {
    const r = intentToDebtInput(
      {
        counterparty: "Ayşe",
        direction: "receivable",
        amountKurus: 100,
        dueDate: "2026-12-31",
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.dueOn).toBe("2026-12-31");
  });

  /** Vade açılıştan önce olamaz: borç kapanmış sayılırdı. */
  test("★ vade açılıştan önceyse reddedilir", () => {
    const r = intentToDebtInput(
      {
        counterparty: "Ali",
        direction: "payable",
        amountKurus: 100,
        dueDate: "2026-01-01",
      },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/vade/i);
  });
});

describe("intentToRecurringInput", () => {
  test("düzenli ödeme girdisi üretir", () => {
    const r = intentToRecurringInput(
      {
        name: "Kira",
        kind: "expense",
        amountKurus: 1500000,
        freq: "monthly",
        dayOf: 5,
        accountName: "Nakit",
        categoryName: "Market",
      },
      { categories: cats, accounts: accs },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      name: "Kira",
      kind: "expense",
      amountKurus: 1500000,
      accountId: "a-nakit",
      categoryId: "c-market",
      note: null,
      freq: "monthly",
      dayOf: 5,
      monthOf: null,
      startDate: TODAY,
      endDate: null,
    });
  });

  /**
   * ── HAFTALIK KURALDA GÜN 1-7 ──
   *
   * `dayOf` haftalıkta ISO hafta günü (1=Pazartesi…7=Pazar).
   * `intent.ts` 1-31 aralığını doğruluyor; haftalık için 12 gibi
   * bir değer oradan GEÇER ve burada yakalanmalı. Yoksa kural
   * hiç tetiklenmeyen bir güne kurulur ve kullanıcı sebebini
   * hiç anlamaz.
   */
  test("★ haftalık kuralda gün 7'den büyükse reddedilir", () => {
    const r = intentToRecurringInput(
      {
        name: "Haftalık",
        kind: "expense",
        amountKurus: 100,
        freq: "weekly",
        dayOf: 12,
        accountName: "Nakit",
      },
      { categories: cats, accounts: accs },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/haftalık|pazartesi/i);
  });

  /** Yıllık kuralda ay zorunlu: hangi ay olduğu belirsiz kalamaz. */
  test("★ yıllık kuralda monthOf yoksa reddedilir", () => {
    const r = intentToRecurringInput(
      {
        name: "Vergi",
        kind: "expense",
        amountKurus: 100,
        freq: "yearly",
        dayOf: 15,
        accountName: "Nakit",
      },
      { categories: cats, accounts: accs },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/ay/i);
  });

  test("hesap bulunamazsa hata", () => {
    const r = intentToRecurringInput(
      {
        name: "Kira",
        kind: "expense",
        amountKurus: 100,
        freq: "monthly",
        dayOf: 1,
        accountName: "Vakıfbank",
      },
      { categories: cats, accounts: accs },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Vakıfbank");
  });
});

describe("resolveTargetId -- ★ kimlik ADDAN çözülür", () => {
  /**
   * ── NEDEN `args.id` KULLANILAMAZ ──
   *
   * Modele hiçbir kimlik gönderilmiyor: ne sistem yönergesinde
   * (`prompt.ts` yalnızca ad listeler) ne okuma araçlarının
   * çıktısında. Dolayısıyla modelin ürettiği `id` alanı ancak
   * UYDURMA olabilir.
   *
   * Uydurma kimlikle `.eq("id", ...)` çağırmak sıfır satır
   * etkiler (Supabase hata vermez) ve kullanıcı "oldu" sanır ama
   * hiçbir şey olmaz — sessiz bir başarısızlık. RLS gerçek bir
   * yabancı kimlikte de koruyor, ama asıl sorun aracın HİÇ
   * çalışmaması.
   *
   * Çözüm: bu araçlar da ADLA çalışır.
   */
  test("hesap adı kimliğe çevrilir", () => {
    const r = resolveTargetId({ accountName: "Nakit" }, "accountName", accs);
    expect(r).toEqual({ ok: true, id: "a-nakit" });
  });

  test("kategori adı kimliğe çevrilir", () => {
    const r = resolveTargetId({ categoryName: "Market" }, "categoryName", cats);
    expect(r).toEqual({ ok: true, id: "c-market" });
  });

  test("ad yoksa anlaşılır hata", () => {
    const r = resolveTargetId({}, "accountName", accs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/hangi/i);
  });

  test("uydurulmuş ad reddedilir", () => {
    const r = resolveTargetId({ accountName: "Vakıfbank" }, "accountName", accs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Vakıfbank");
  });
});
