/**
 * Kullanıcı başına hız sınırı.
 *
 * ── NEDEN GEREKLİ ──
 *
 * Model zinciri tek istekte 5 modele kadar deneme yapıyor: bir
 * `/api/chat` çağrısı yukarı akışta 5 çağrıya kadar çıkabilir.
 * `GEMINI_API_KEY` TEK ve tüm kullanıcılarla paylaşılıyor, yani
 * döngüye giren bir istemci günlük kotayı HERKES için tüketir.
 * Diğer kullanıcılar "asistan çalışmıyor" görür ve sebebini kimse
 * anlamaz.
 *
 * Oturum zorunlu olduğu için bu anonim bir saldırı değil; ama
 * paylaşılan kaynağın tükenmesi gerçek bir risk ve sınır bunu
 * kullanıcının kendi payına hapsediyor.
 *
 * ── NEDEN BELLEK İÇİ ──
 *
 * Tek sunucu örneği için yeterli ve bağımlılık gerektirmiyor.
 * SINIRI: birden fazla örneğe (ya da sunucusuz/serverless ortama)
 * dağıtıldığında her örnek kendi sayacını tutar ve etkin sınır
 * örnek sayısı kadar katlanır. O gün geldiğinde sayaç paylaşılan
 * bir yere (Postgres tablosu ya da Redis) taşınmalı; `check`
 * arayüzü aynı kalabilir.
 *
 * Sunucu yeniden başladığında sayaçlar sıfırlanır. Kota koruması
 * için kabul edilebilir: yeniden başlatma saldırgan kontrolünde
 * değil.
 */

/**
 * Pencere başına izin verilen istek sayısı (kullanıcı başına).
 *
 * ── YUKARI AKIŞ ÇARPANI ──
 *
 * Bir `/api/chat` isteği en kötü durumda:
 *   5 (model zinciri, geçici hatalarda düşme)
 *   × 2 (okuma sorusunda ikinci tur: araç sonucunu geri gönderme)
 *   = 10 Gemini çağrısı
 *
 * Yani dakikada 6 istek → ~60 çağrı. Anahtar TEK ve paylaşımlı.
 * Faz 5'te ikinci tur eklenince çarpan 5'ten 10'a çıktı; sınır da
 * 10'dan 6'ya indirildi ki üst bant yerinde kalsın.
 *
 * 6 istek/dakika gerçek kullanımı kısıtlamıyor: sohbet asistanına
 * 10 saniyede bir soru sormak zaten hızlı sayılır.
 */
export const RATE_LIMIT = 6;

/** Kayan pencere uzunluğu. */
export const RATE_WINDOW_MS = 60_000;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export class RateLimiter {
  /** Kullanıcı kimliği → o pencereye düşen istek zaman damgaları. */
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number = RATE_LIMIT,
    private readonly windowMs: number = RATE_WINDOW_MS,
  ) {}

  /** Kaç kullanıcı izleniyor — bellek temizliğini sınamak için. */
  get size(): number {
    return this.hits.size;
  }

  /**
   * İsteğe izin var mı? İzin varsa sayaca EKLER.
   *
   * @param key Kullanıcı kimliği (JWT `sub`).
   * @param now Zaman damgası — enjekte edilir ki testler sahte
   *            zamana ihtiyaç duymadan pencere kenarlarını sınasın.
   */
  check(key: string, now: number = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;

    this.sweep(cutoff);

    // Kayan pencere: yalnızca pencere içindeki istekler sayılır.
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (recent.length >= this.limit) {
      // En eski istek pencereden çıkınca bir yer açılır.
      const oldest = recent[0];
      const waitMs = oldest + this.windowMs - now;
      this.hits.set(key, recent);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
      };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }

  /**
   * Süresi geçmiş kayıtları atar.
   *
   * Olmasa harita her yeni kullanıcıyla büyür ve uzun çalışan
   * sunucuda bellek sızdırır.
   */
  private sweep(cutoff: number): void {
    for (const [key, times] of this.hits) {
      const live = times.filter((t) => t > cutoff);
      if (live.length === 0) this.hits.delete(key);
      else this.hits.set(key, live);
    }
  }
}
