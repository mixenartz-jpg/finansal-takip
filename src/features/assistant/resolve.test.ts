import { describe, expect, test } from "vitest";
import { resolveName, type NamedRecord } from "./resolve";

/**
 * Ad → kimlik çözümlemesi.
 *
 * ── NEDEN AYRI BİR KATMAN ──
 *
 * Gemini'ye yalnızca ADLAR gönderiyoruz (kimlik sızdırmamak için),
 * ama mutation hook'ları KİMLİK istiyor. Arada bir çeviri şart.
 *
 * ── NEDEN GÜVENİLMEZ ──
 *
 * Model listede olmayan bir ad uydurabilir ("Vakıfbank" diye bir
 * hesabı yoksa bile). O ad sessizce `null`'a çevrilirse işlem
 * yanlış hesaba yazılır ya da kategorisiz kaydedilir — kullanıcı
 * farkı aylar sonra raporda görür. Bu yüzden çözümlenemeyen ad
 * HATA döndürür, null değil.
 */

const cats: NamedRecord[] = [
  { id: "c1", name: "Market" },
  { id: "c2", name: "Maaş" },
  { id: "c3", name: "Ulaşım" },
];

describe("resolveName -- tam eşleşme", () => {
  test("birebir ad bulunur", () => {
    expect(resolveName("Market", cats)).toEqual({ ok: true, id: "c1" });
  });

  /** Model büyük/küçük harfi koruyamayabilir. */
  test("büyük/küçük harf duyarsız", () => {
    expect(resolveName("market", cats)).toEqual({ ok: true, id: "c1" });
    expect(resolveName("MARKET", cats)).toEqual({ ok: true, id: "c1" });
  });

  test("baştaki/sondaki boşluk kırpılır", () => {
    expect(resolveName("  Market  ", cats)).toEqual({ ok: true, id: "c1" });
  });

  /**
   * ── TÜRKÇE BÜYÜK HARF TUZAĞI ──
   *
   * `"MAAŞ".toLowerCase()` → "maaş" ama `"I".toLowerCase()` → "i"
   * ve Türkçede "I" küçük harfi "ı"dır. `toLocaleLowerCase("tr")`
   * kullanılmazsa "ULAŞIM" → "ulaşim" olur ve "Ulaşım" ile
   * eşleşmez. Model büyük harfle yazdığında kategori bulunamazdı.
   */
  test("★ Türkçe I/ı eşleşmesi doğru", () => {
    expect(resolveName("ULAŞIM", cats)).toEqual({ ok: true, id: "c3" });
    expect(resolveName("MAAŞ", cats)).toEqual({ ok: true, id: "c2" });
  });
});

describe("resolveName -- ★ bulunamayan ad HATA döner", () => {
  /**
   * Uydurulmuş ad sessizce null'a çevrilirse işlem yanlış yere
   * yazılır ve kullanıcı farkı aylar sonra raporda görür.
   */
  test("listede olmayan ad reddedilir", () => {
    const r = resolveName("Vakıfbank", cats);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Hata mesajı hem aranan adı hem seçenekleri söylemeli:
    // kullanıcı neyin yanlış gittiğini anlamalı.
    expect(r.error).toContain("Vakıfbank");
    expect(r.error).toContain("Market");
  });

  test("boş ad reddedilir", () => {
    expect(resolveName("", cats).ok).toBe(false);
    expect(resolveName("   ", cats).ok).toBe(false);
  });

  test("boş listede her ad reddedilir", () => {
    const r = resolveName("Market", []);
    expect(r.ok).toBe(false);
  });
});

describe("resolveName -- çok eşleşme", () => {
  /**
   * Kullanıcı aynı adı iki kez kullanmış olabilir (biri gelir biri
   * gider kategorisi). Hangisini kastettiği belirsizse SEÇMEYİZ:
   * yanlış olanı seçmek, sormaktan kötüdür.
   */
  test("★ aynı ad iki kayıtta varsa reddedilir", () => {
    const dup: NamedRecord[] = [
      { id: "a", name: "Diğer" },
      { id: "b", name: "Diğer" },
    ];
    const r = resolveName("Diğer", dup);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/birden fazla|hangi/i);
  });
});
