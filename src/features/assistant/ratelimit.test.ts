import { describe, expect, test } from "vitest";
import { RateLimiter, RATE_LIMIT, RATE_WINDOW_MS } from "./ratelimit";

/**
 * Kullanıcı başına hız sınırı.
 *
 * ── NEDEN GEREKLİ ──
 *
 * Model zinciri tek istekte 5 modele kadar deneme yapıyor. Yani
 * `/api/chat`'e yapılan bir çağrı YUKARI AKIŞTA 5 çağrıya kadar
 * çıkabilir — 5x yükseltme.
 *
 * Anahtar TEK ve TÜM kullanıcılarla paylaşılıyor. Döngüye giren
 * tek bir istemci (ya da kötü niyetli bir hesap) günlük kotayı
 * herkes için tüketir; diğer kullanıcılar "asistan çalışmıyor"
 * görür ve sebebini kimse anlamaz.
 *
 * Oturum zorunlu olduğu için bu anonim bir saldırı değil, ama
 * paylaşılan kaynağın tükenmesi gerçek bir risk.
 *
 * ── NEDEN KAYAN PENCERE, SAYAÇ DEĞİL ──
 *
 * Sabit pencere sınır başında ve sonunda iki kat isteğe izin verir
 * (pencere sıfırlanınca kota tazelenir). Kayan pencere bu boşluğu
 * bırakmıyor.
 */

describe("RateLimiter", () => {
  test("sınır içindeki istekler geçer", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect(rl.check("user-1", i * 10).allowed, `${i}. istek reddedildi`).toBe(true);
    }
  });

  test("★ sınır aşılınca reddedilir", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < RATE_LIMIT; i++) rl.check("user-1", 0);

    const r = rl.check("user-1", 0);
    expect(r.allowed).toBe(false);
  });

  test("red cevabı kaç saniye sonra denenmeli söyler", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < RATE_LIMIT; i++) rl.check("user-1", 0);

    const r = rl.check("user-1", 1000);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    // Pencere 0'da doldu, 1 saniye geçti: kalan süre pozitif olmalı.
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(RATE_WINDOW_MS / 1000);
  });

  /**
   * ── KULLANICILAR BİRBİRİNİ ETKİLEMEZ ──
   *
   * Sınır kullanıcı başına. Global olsaydı bir kişinin yoğun
   * kullanımı diğerlerini kilitlerdi — tam önlemeye çalıştığımız
   * şeyin kullanıcı deneyimi hâline gelmiş versiyonu.
   */
  test("★ sınır kullanıcı başına, global DEĞİL", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < RATE_LIMIT; i++) rl.check("user-1", 0);

    expect(rl.check("user-1", 0).allowed).toBe(false);
    // Başka kullanıcı etkilenmemeli.
    expect(rl.check("user-2", 0).allowed).toBe(true);
  });

  test("★ pencere geçince yeniden izin verilir", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < RATE_LIMIT; i++) rl.check("user-1", 0);
    expect(rl.check("user-1", 0).allowed).toBe(false);

    // Pencere tamamen geçti.
    expect(rl.check("user-1", RATE_WINDOW_MS + 1).allowed).toBe(true);
  });

  /**
   * Kayan pencere: eski istekler tek tek düşer, hepsi birden değil.
   * Sabit pencere olsaydı sınır anında tazelenir ve pencere
   * sınırında iki kat isteğe izin verilirdi.
   */
  test("kayan pencere: eski istekler tek tek düşer", () => {
    const rl = new RateLimiter();
    // İstekleri pencere boyunca yay.
    for (let i = 0; i < RATE_LIMIT; i++) {
      rl.check("user-1", i * 100);
    }
    expect(rl.check("user-1", RATE_LIMIT * 100).allowed).toBe(false);

    // İlk istek penceresinin dışına çıkınca tek bir yer açılır.
    expect(rl.check("user-1", RATE_WINDOW_MS + 1).allowed).toBe(true);
  });

  /**
   * ── BELLEK SIZINTISI ──
   *
   * Her kullanıcı için bir kayıt tutuluyor. Temizlik olmasa
   * uzun süre çalışan sunucuda harita sınırsız büyürdü.
   */
  test("süresi geçmiş kayıtlar temizlenir", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 50; i++) rl.check(`user-${i}`, 0);
    expect(rl.size).toBe(50);

    // Pencereden çok sonra gelen bir istek eski kayıtları süpürür.
    rl.check("yeni-kullanici", RATE_WINDOW_MS * 2);
    expect(rl.size).toBe(1);
  });
});
