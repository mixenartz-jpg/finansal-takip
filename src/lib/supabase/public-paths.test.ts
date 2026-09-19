import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Açık yol eşleştirmesinin kapısı.
 *
 * ── NEDEN BU TEST VAR ──
 *
 * `middleware.ts` Next.js çalışma zamanına bağlı olduğu için node
 * ortamında doğrudan çağrılamaz (NextRequest, cookies, Supabase
 * istemcisi). Bunun yerine eşleştirme MANTIĞI burada birebir
 * yeniden kurulur ve davranışı sınanır; ayrıca kaynak dosyanın
 * hâlâ segment sınırı kullandığı metinsel olarak doğrulanır.
 *
 * Düz `startsWith` kullanımına dönülürse `/girisyap` gibi bir rota
 * kimlik doğrulamasını tamamen atlar ve bunu fark ettirecek hiçbir
 * hata mesajı olmaz — bu yüzden kural teste bağlanmıştır.
 */

const PUBLIC_PATHS = ["/giris", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

describe("isPublicPath -- açık yollar", () => {
  test("/giris açıktır", () => {
    expect(isPublicPath("/giris")).toBe(true);
  });
  test("/auth/callback açıktır -- alt yol da geçerli", () => {
    expect(isPublicPath("/auth/callback")).toBe(true);
  });
  test("/giris/ sondaki eğik çizgiyle de açıktır", () => {
    expect(isPublicPath("/giris/")).toBe(true);
  });
});

describe("isPublicPath -- korumalı yollar", () => {
  test("kök korumalıdır", () => {
    expect(isPublicPath("/")).toBe(false);
  });
  test("/islemler korumalıdır", () => {
    expect(isPublicPath("/islemler")).toBe(false);
  });
  test("/hesaplar korumalıdır", () => {
    expect(isPublicPath("/hesaplar")).toBe(false);
  });
});

describe("isPublicPath -- ★ önek sızıntısı olmamalı", () => {
  /**
   * Bu isimlerde bir rota bugün YOK. Test, ileride eklenirlerse
   * kimlik doğrulamasını atlamayacaklarını garanti eder.
   */
  const lookalikes = [
    "/girisyap",
    "/girisimci",
    "/giris-ayarlari",
    "/auth-ayarlar",
    "/authentication",
    "/authorize",
  ];

  for (const path of lookalikes) {
    test(`${path} KORUMALI olmalı -- /giris veya /auth ile başlıyor ama farklı segment`, () => {
      expect(isPublicPath(path)).toBe(false);
    });
  }
});

describe("kaynak dosya hâlâ segment sınırı kullanıyor mu", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "./middleware.ts"),
    "utf-8",
  );

  test("isPublicPath yardımcısı yerinde", () => {
    expect(source).toContain("function isPublicPath");
  });

  test("eşleştirme segment sınırında yapılıyor", () => {
    // `pathname === p || pathname.startsWith(`${p}/`)` kalıbı.
    expect(source).toMatch(/pathname === p \|\| pathname\.startsWith\(`\$\{p\}\/`\)/);
  });

  test("çıplak PUBLIC_PATHS.some(startsWith) kalıbına DÖNÜLMEMİŞ", () => {
    // Regresyonun tam imzası: açık yol listesi üzerinde segment
    // sınırı olmadan startsWith.
    expect(source).not.toMatch(
      /PUBLIC_PATHS\.some\(\s*\(p\)\s*=>\s*pathname\.startsWith\(p\)\s*\)/,
    );
  });
});
