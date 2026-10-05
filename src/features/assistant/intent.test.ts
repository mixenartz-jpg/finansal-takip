import { describe, expect, test } from "vitest";
import { parseIntent, MAX_BATCH } from "./intent";

/**
 * Niyet doğrulaması — GÜVENLİK SINIRI.
 *
 * ── NEDEN GEMINI'YE GÜVENİLMEZ ──
 *
 * Gemini'nin döndürdüğü nesne kullanıcı girdisi kadar güvenilmezdir.
 * Model uydurabilir: tanımsız araç adı, eksik zorunlu alan, string
 * gelen sayı, 400 kayıtlık silme listesi. Hepsi gerçekten oluyor.
 *
 * Bu modül tek kapı: buradan geçmeyen hiçbir şey Faz 4'teki mutation
 * hook'larına ulaşmaz. Testlerin çoğu KÖTÜ girdi üzerine kurulu,
 * çünkü iyi girdi zaten çalışıyor.
 */

const ok = { name: "getBalances", arguments: {} };

describe("parseIntent -- geçerli niyet", () => {
  test("okuma aracı kabul edilir ve onay gerektirmez", () => {
    const r = parseIntent(ok);
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.intent.name).toBe("getBalances");
    expect(r.intent.needsConfirm).toBe(false);
  });

  test("yazma aracı onay gerektirir", () => {
    const r = parseIntent({
      name: "createTransaction",
      arguments: { kind: "expense", amountKurus: 30000, date: "2026-09-21" },
    });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.intent.needsConfirm).toBe(true);
    expect(r.intent.args.amountKurus).toBe(30000);
  });
});

describe("parseIntent -- ★ bozuk girdi REDDEDİLİR", () => {
  test("tanımsız araç adı reddedilir", () => {
    const r = parseIntent({ name: "dropAllTables", arguments: {} });
    expect(r.valid).toBe(false);
    if (r.valid) return;
    expect(r.error).toMatch(/tanımadım|anlayamadım/i);
  });

  test("araç adı yoksa reddedilir", () => {
    expect(parseIntent({ arguments: {} }).valid).toBe(false);
  });

  test("null ve ilkel değerler reddedilir", () => {
    for (const bad of [null, undefined, 42, "getBalances", true, []]) {
      expect(parseIntent(bad).valid, `${JSON.stringify(bad)} kabul edildi`).toBe(false);
    }
  });

  test("arguments nesne değilse reddedilir", () => {
    expect(parseIntent({ name: "getBalances", arguments: "hepsi" }).valid).toBe(false);
    expect(parseIntent({ name: "getBalances", arguments: 5 }).valid).toBe(false);
  });

  /** `arguments` hiç gelmezse boş nesne sayılır: parametresiz araçlar var. */
  test("arguments eksikse boş kabul edilir", () => {
    const r = parseIntent({ name: "getBalances" });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.intent.args).toEqual({});
  });

  /**
   * ── TUTAR TUZAĞI ──
   *
   * Model tutarı bazen string ("30000"), bazen kesirli (300.5)
   * döndürüyor. Kuruş TAM SAYI olmak zorunda: 300.5 kuruş diye bir
   * şey yok ve float para bu projede yasak.
   */
  test("kesirli tutar reddedilir", () => {
    const r = parseIntent({
      name: "createTransaction",
      arguments: { kind: "expense", amountKurus: 300.5, date: "2026-09-21" },
    });
    expect(r.valid).toBe(false);
    if (r.valid) return;
    expect(r.error).toMatch(/tutar/i);
  });

  test("string tutar reddedilir", () => {
    expect(
      parseIntent({
        name: "createTransaction",
        arguments: { kind: "expense", amountKurus: "30000", date: "2026-09-21" },
      }).valid,
    ).toBe(false);
  });

  test("sıfır ve negatif tutar reddedilir", () => {
    for (const amountKurus of [0, -100]) {
      expect(
        parseIntent({
          name: "createTransaction",
          arguments: { kind: "expense", amountKurus, date: "2026-09-21" },
        }).valid,
        `${amountKurus} kabul edildi`,
      ).toBe(false);
    }
  });

  /**
   * ── AÇILIŞ BAKİYESİ İSTİSNASI ──
   *
   * Kredi kartı hesabı NEGATİF açılış bakiyesiyle başlar (borç) ve
   * şemada `opening_kurus`'ta `> 0` kısıtı yoktur. Genel "tutar
   * pozitif olmalı" kuralı buraya uygulanırsa kullanıcı kredi
   * kartını asistan üzerinden hiç ekleyemez.
   */
  test("★ açılış bakiyesi NEGATİF olabilir", () => {
    const r = parseIntent({
      name: "createAccount",
      arguments: { name: "Kart", kind: "credit_card", openingKurus: -250000 },
    });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.intent.args.openingKurus).toBe(-250000);
  });

  test("açılış bakiyesi yine de tam sayı olmalı", () => {
    expect(
      parseIntent({
        name: "createAccount",
        arguments: { name: "Kart", kind: "credit_card", openingKurus: -250.75 },
      }).valid,
    ).toBe(false);
  });

  test("bozuk tarih reddedilir", () => {
    for (const date of ["21-09-2026", "2026/09/21", "yarın", "2026-13-45"]) {
      const r = parseIntent({
        name: "createTransaction",
        arguments: { kind: "expense", amountKurus: 100, date },
      });
      expect(r.valid, `"${date}" kabul edildi`).toBe(false);
    }
  });

  test("tanımsız kind reddedilir", () => {
    expect(
      parseIntent({
        name: "createTransaction",
        arguments: { kind: "maas", amountKurus: 100, date: "2026-09-21" },
      }).valid,
    ).toBe(false);
  });

  test("zorunlu alan eksikse reddedilir", () => {
    // createTransaction: kind, amountKurus, date zorunlu.
    const r = parseIntent({
      name: "createTransaction",
      arguments: { kind: "expense" },
    });
    expect(r.valid).toBe(false);
    if (r.valid) return;
    expect(r.error).toMatch(/eksik/i);
  });

  test("id zorunlu olan araçta id yoksa reddedilir", () => {
    expect(parseIntent({ name: "archiveAccount", arguments: {} }).valid).toBe(false);
    expect(parseIntent({ name: "updateTransaction", arguments: { note: "x" } }).valid).toBe(
      false,
    );
  });

  test("boş string id reddedilir", () => {
    expect(parseIntent({ name: "archiveAccount", arguments: { id: "   " } }).valid).toBe(
      false,
    );
  });
});

describe("parseIntent -- ★ toplu işlem sınırı", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

  test("sınır içindeki silme kabul edilir", () => {
    const r = parseIntent({ name: "deleteTransaction", arguments: { ids: ids(MAX_BATCH) } });
    expect(r.valid).toBe(true);
  });

  /**
   * Gemini "geçen ay" yerine "geçen yıl" anlarsa 400 kayıtlık silme
   * niyeti üretebilir. 400 satırlık onay kartı okunmaz; kullanıcı
   * körlemesine onaylar ve koruma ortadan kalkar. Sınır tam bu
   * senaryo için var.
   */
  test("sınır aşılırsa reddedilir ve sayı mesajda geçer", () => {
    const r = parseIntent({
      name: "deleteTransaction",
      arguments: { ids: ids(MAX_BATCH + 1) },
    });
    expect(r.valid).toBe(false);
    if (r.valid) return;
    expect(r.error).toContain(String(MAX_BATCH + 1));
    expect(r.error).toMatch(/daralt|geniş/i);
  });

  test("boş ids reddedilir", () => {
    expect(parseIntent({ name: "deleteTransaction", arguments: { ids: [] } }).valid).toBe(
      false,
    );
  });

  test("ids dizi değilse reddedilir", () => {
    expect(parseIntent({ name: "deleteTransaction", arguments: { ids: "hepsi" } }).valid).toBe(
      false,
    );
  });

  test("ids içinde string olmayan varsa reddedilir", () => {
    expect(
      parseIntent({ name: "deleteTransaction", arguments: { ids: ["a", 5] } }).valid,
    ).toBe(false);
  });
});

describe("parseIntent -- bilinmeyen argüman ELENİR", () => {
  /**
   * Model şemada olmayan bir alan uydurursa (örn. `userId`) o alan
   * sessizce ATILIR, istek reddedilmez. Reddetmek kullanıcıyı
   * modelin fazlalığı yüzünden cezalandırırdı; geçirmek ise
   * beklenmeyen alanın hook'a sızması demek olurdu.
   */
  test("şemada olmayan alan atılır", () => {
    const r = parseIntent({
      name: "createTransaction",
      arguments: {
        kind: "expense",
        amountKurus: 100,
        date: "2026-09-21",
        userId: "baskasinin-id-si",
        isAdmin: true,
      },
    });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.intent.args).not.toHaveProperty("userId");
    expect(r.intent.args).not.toHaveProperty("isAdmin");
    expect(r.intent.args.kind).toBe("expense");
  });
});
