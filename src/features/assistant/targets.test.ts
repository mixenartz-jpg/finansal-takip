import { describe, test, expect } from "vitest";
import {
  candidateProblem,
  initialSelection,
  matchByName,
  matchTransactions,
  targetSpec,
  toggleSelection,
  transactionRange,
} from "./targets";
import { MAX_BATCH } from "./intent";
import { TOOLS, WRITE_TOOLS } from "./tools";

const cats = [
  { id: "c-market", name: "Market" },
  { id: "c-ulasim", name: "Ulaşım" },
];

const tx = (id: string, date: string, extra: Partial<{ amountKurus: number; categoryId: string | null; note: string | null }> = {}) => ({
  id,
  date,
  amountKurus: 10_000,
  categoryId: "c-market",
  note: null,
  ...extra,
});

const txs = [
  tx("t1", "2026-10-04", { note: "Migros alışverişi", amountKurus: 30_000 }),
  tx("t2", "2026-10-04", { categoryId: "c-ulasim", note: "taksi" }),
  tx("t3", "2026-10-03"),
  tx("t4", "2026-10-05", { categoryId: null }),
];

describe("targetSpec", () => {
  /**
   * Hedef kaydı tarif eden HER alan şemada tanımlı olmalı. Biri
   * şemadan düşerse `parseIntent` onu sessizce atar ve seçici
   * tarifin bir parçasını kaybeder — "dünkü market" "dünkü HER ŞEY"
   * olur.
   */
  test("tarif alanları araç şemasında tanımlı", () => {
    for (const t of TOOLS) {
      const spec = targetSpec(t.name);
      if (!spec) continue;
      for (const key of spec.matchKeys) {
        expect(Object.keys(t.parameters.properties), `${t.name}.${key}`).toContain(key);
      }
    }
  });

  test("yalnızca toplu silme çoklu seçimlidir", () => {
    const multi = WRITE_TOOLS.filter((n) => targetSpec(n)?.multi);
    expect(multi).toEqual(["deleteTransaction"]);
  });

  test("oluşturma araçları hedef istemez", () => {
    expect(targetSpec("createTransaction")).toBeNull();
    expect(targetSpec("getBalances")).toBeNull();
  });

  test("hedef isteyen her araç bir yazma aracıdır", () => {
    for (const t of TOOLS) {
      if (targetSpec(t.name)) expect(WRITE_TOOLS).toContain(t.name);
    }
  });
});

describe("transactionRange", () => {
  test("geçerli aralık", () => {
    expect(transactionRange({ matchFrom: "2026-10-01", matchTo: "2026-10-04" })).toEqual({
      ok: true,
      from: "2026-10-01",
      to: "2026-10-04",
    });
  });

  test("ters aralık reddedilir", () => {
    const r = transactionRange({ matchFrom: "2026-10-05", matchTo: "2026-10-01" });
    expect(r.ok).toBe(false);
  });

  test("bir yıldan geniş aralık reddedilir", () => {
    const r = transactionRange({ matchFrom: "2024-01-01", matchTo: "2026-01-01" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/geniş/);
  });

  test("eksik ya da takvimde olmayan tarih reddedilir", () => {
    expect(transactionRange({ matchFrom: "2026-10-01" }).ok).toBe(false);
    expect(transactionRange({ matchFrom: "2026-02-31", matchTo: "2026-03-01" }).ok).toBe(false);
  });
});

describe("matchTransactions", () => {
  const ids = (args: Record<string, unknown>) =>
    matchTransactions(txs, args, cats).map((t) => t.id);

  test("tarih aralığına göre süzer", () => {
    expect(ids({ matchFrom: "2026-10-04", matchTo: "2026-10-04" })).toEqual(["t1", "t2"]);
  });

  test("kategori adı Türkçe büyük/küçük harf duyarsız", () => {
    expect(
      ids({ matchFrom: "2026-10-01", matchTo: "2026-10-31", matchCategoryName: "ULAŞIM" }),
    ).toEqual(["t2"]);
  });

  /**
   * Var olmayan kategoriyle süzmek boş dönmeli. Filtreyi düşürmek
   * "dünkü kira işlemini sil" isteğini dünkü TÜM işlemlere
   * genişletirdi.
   */
  test("★ bilinmeyen kategori hiçbir şey eşlemez", () => {
    expect(
      ids({ matchFrom: "2026-10-01", matchTo: "2026-10-31", matchCategoryName: "Kira" }),
    ).toEqual([]);
  });

  test("açıklamada geçen metinle süzer", () => {
    expect(ids({ matchFrom: "2026-10-01", matchTo: "2026-10-31", matchNote: "migros" })).toEqual([
      "t1",
    ]);
  });

  test("tutarla süzer", () => {
    expect(
      ids({ matchFrom: "2026-10-01", matchTo: "2026-10-31", matchAmountKurus: 30_000 }),
    ).toEqual(["t1"]);
  });

  test("geçersiz aralık boş döner", () => {
    expect(ids({ matchFrom: "2026-10-05", matchTo: "2026-10-01" })).toEqual([]);
  });
});

describe("matchByName", () => {
  const rules = [{ name: "Kira" }, { name: "Kira artışı" }, { name: "Netflix" }];
  const names = (q: unknown) => matchByName(rules, q, (r) => r.name).map((r) => r.name);

  test("tam eşleşme varsa kısmi eşleşmeler gösterilmez", () => {
    expect(names("kira")).toEqual(["Kira"]);
  });

  test("tam eşleşme yoksa içerenler aday olur", () => {
    expect(names("art")).toEqual(["Kira artışı"]);
  });

  test("boş ya da metin olmayan ad hiçbir şey eşlemez", () => {
    expect(names("  ")).toEqual([]);
    expect(names(undefined)).toEqual([]);
  });
});

describe("candidateProblem", () => {
  test("aday yoksa söyler", () => {
    expect(candidateProblem(0)).toMatch(/bulamadım/);
  });

  test("sınır içinde sorun yok", () => {
    expect(candidateProblem(1)).toBeNull();
    expect(candidateProblem(MAX_BATCH)).toBeNull();
  });

  /**
   * Gemini "geçen ay" yerine "geçen yıl" anlarsa yüzlerce aday çıkar.
   * 400 satırlık seçici okunmaz; kullanıcı körlemesine seçer.
   */
  test("★ sınır aşılırsa sayıyla daraltma ister", () => {
    const msg = candidateProblem(MAX_BATCH + 1);
    expect(msg).toContain(String(MAX_BATCH + 1));
    expect(msg).toMatch(/daralt/);
  });
});

describe("seçim", () => {
  test("tek aday seçili gelir", () => {
    expect(initialSelection([{ id: "a" }])).toEqual(["a"]);
  });

  /** Birden fazla adayda rastgele seçim yanlış kaydı değiştirir. */
  test("★ birden fazla adayda hiçbiri seçili gelmez", () => {
    expect(initialSelection([{ id: "a" }, { id: "b" }])).toEqual([]);
  });

  test("tekli modda yeni seçim eskisinin yerine geçer", () => {
    expect(toggleSelection(["a"], "b", false)).toEqual(["b"]);
  });

  test("çoklu modda aç/kapa", () => {
    expect(toggleSelection(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "a", true)).toEqual(["b"]);
  });

  test("çoklu modda sınır aşılamaz", () => {
    const full = Array.from({ length: MAX_BATCH }, (_, i) => `x${i}`);
    expect(toggleSelection(full, "yeni", true)).toHaveLength(MAX_BATCH);
  });
});
