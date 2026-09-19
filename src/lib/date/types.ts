/**
 * Takvim tarihi tipleri.
 *
 * TEMEL KURAL: Takvim tarihi bu uygulamada `DateStr` — 'YYYY-MM-DD'
 * formatında bir string'dir. `Date` nesnesi yalnızca `src/lib/date/`
 * içinde kurulur ve modül sınırını asla geçmez.
 *
 * Neden: Türkiye UTC+3. `new Date()` üzerinden `toISOString()` ile tarih
 * çıkarmak gece 00:00–03:00 arası ÖNCEKİ günü verir; kullanıcı 00:30'da
 * bir rutini işaretler, kayıt dünkü güne düşer. Postgres `date` sütunu
 * zaten timezone'suzdur ve supabase-js onu 'YYYY-MM-DD' string'i olarak
 * döndürür — yani tel formatı ile bellek formatı aynıdır, hiçbir yerde
 * dönüşüm gerekmez.
 */

/** 'YYYY-MM-DD' — markalı tip, yanlışlıkla düz string atanmasını engeller. */
export type DateStr = string & { readonly __brand: "DateStr" };

/** ISO-8601 hafta günü: Pazartesi=1 … Pazar=7. JS getDay() DEĞİLDİR. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Esnek rutinlerin dönem birimi. */
export type Period = "week" | "month";

/** Uygulamanın çalıştığı saat dilimi. Tek kaynak. */
export const APP_TIMEZONE = "Europe/Istanbul";

/**
 * Günün başlangıç saati. Şimdilik gece yarısı.
 *
 * İleride "gün 04:00'te başlasın" istenirse (gece 02:00'de işaretlenen
 * şey hâlâ dünkü güne saysın) burası değişir — `todayStr()` tek darboğaz
 * olduğu için tüm uygulama tek noktadan uyum sağlar.
 */
export const DAY_START_HOUR = 0;
