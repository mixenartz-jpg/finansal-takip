/**
 * Tarih yardımcıları — uygulamadaki TEK `Date` sınırı.
 *
 * Buradaki fonksiyonlar dışında hiçbir yerde `new Date(...)`,
 * `toISOString()` veya `getDay()` kullanılmaz. Gerekçe: `types.ts`.
 */

import {
  APP_TIMEZONE,
  DAY_START_HOUR,
  type DateStr,
  type IsoWeekday,
} from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Bir string'in geçerli 'YYYY-MM-DD' olup olmadığını kontrol eder. */
export function isDateStr(s: string): s is DateStr {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

/** Doğrulayarak DateStr'e çevirir. Geçersizse fırlatır. */
export function asDateStr(s: string): DateStr {
  if (!isDateStr(s)) throw new RangeError(`Geçersiz tarih: "${s}"`);
  return s;
}

/** Yıl+ay+gün bileşenlerinden DateStr üretir (ay 1-12). */
export function fromParts(year: number, month: number, day: number): DateStr {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}` as DateStr;
}

/** DateStr'i sayısal bileşenlerine ayırır (ay 1-12). */
export function toParts(d: DateStr): { year: number; month: number; day: number } {
  const [year, month, day] = d.split("-").map(Number);
  return { year, month, day };
}

/**
 * Bir `Date` nesnesini uygulama saat diliminde DateStr'e çevirir.
 *
 * `toISOString()` YERİNE Intl kullanılır: 'en-CA' yerel ayarı tarihi
 * doğrudan 'YYYY-MM-DD' olarak biçimlendirir ve `timeZone` seçeneği
 * UTC kaymasını ortadan kaldırır. Vercel sunucuları UTC'de çalıştığı
 * için bu, sunucu tarafı render'da da doğru sonucu verir.
 */
const FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toDateStr(d: Date): DateStr {
  return FORMATTER.format(d) as DateStr;
}

/**
 * Uygulama saat diliminde "bugün".
 *
 * Tüm uygulamanın tek "şimdi" kaynağıdır. `DAY_START_HOUR` sıfırdan
 * büyükse, o saatten önceki anlar hâlâ önceki güne sayılır.
 */
export function todayStr(now: Date = new Date()): DateStr {
  const today = toDateStr(now);
  if (DAY_START_HOUR === 0) return today;

  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: APP_TIMEZONE,
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  return hour < DAY_START_HOUR ? addDays(today, -1) : today;
}

/**
 * DateStr'i UTC gün ortası `Date`'ine çevirir — yalnızca aritmetik için.
 *
 * Gün ortası (12:00) kullanılır ki, herhangi bir saat kayması gün
 * sınırını aşmasın. Bu Date asla dışarı sızmaz.
 */
function toUtcNoon(d: DateStr): Date {
  const { year, month, day } = toParts(d);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

const MS_PER_DAY = 86_400_000;

function fromUtcNoon(dt: Date): DateStr {
  return fromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Tarihe gün ekler (negatif olabilir). */
export function addDays(d: DateStr, n: number): DateStr {
  if (n === 0) return d;
  return fromUtcNoon(new Date(toUtcNoon(d).getTime() + n * MS_PER_DAY));
}

/** a - b, gün cinsinden. Aynı günse 0, a sonraysa pozitif. */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((toUtcNoon(a).getTime() - toUtcNoon(b).getTime()) / MS_PER_DAY);
}

/** Kronolojik karşılaştırma. Sözlüksel sıralama ISO formatta zaten doğrudur. */
export function compareDates(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: DateStr, b: DateStr): DateStr {
  return a <= b ? a : b;
}

export function maxDate(a: DateStr, b: DateStr): DateStr {
  return a >= b ? a : b;
}

/** ISO-8601 hafta günü: Pazartesi=1 … Pazar=7. */
export function isoWeekday(d: DateStr): IsoWeekday {
  // getUTCDay(): Pazar=0 … Cumartesi=6 → ISO'ya çevir.
  const jsDay = toUtcNoon(d).getUTCDay();
  return (jsDay === 0 ? 7 : jsDay) as IsoWeekday;
}

/** Belirtilen ayın gün sayısı (ay 1-12). Artık yılları doğru hesaplar. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Bir ayın tüm günleri, sıralı (ay 1-12). */
export function monthDays(year: number, month: number): DateStr[] {
  const count = daysInMonth(year, month);
  const out: DateStr[] = new Array(count);
  for (let i = 0; i < count; i++) out[i] = fromParts(year, month, i + 1);
  return out;
}

/** Ayın ilk günü. */
export function startOfMonth(d: DateStr): DateStr {
  const { year, month } = toParts(d);
  return fromParts(year, month, 1);
}

/** Ayın son günü. */
export function endOfMonth(d: DateStr): DateStr {
  const { year, month } = toParts(d);
  return fromParts(year, month, daysInMonth(year, month));
}

/** İçinde bulunulan ISO haftanın Pazartesi'si. */
export function startOfIsoWeek(d: DateStr): DateStr {
  return addDays(d, -(isoWeekday(d) - 1));
}

/** İçinde bulunulan ISO haftanın Pazar'ı. */
export function endOfIsoWeek(d: DateStr): DateStr {
  return addDays(d, 7 - isoWeekday(d));
}

/** İki tarih arasındaki tüm günler (her iki uç dahil). */
export function eachDay(from: DateStr, to: DateStr): DateStr[] {
  const n = diffDays(to, from);
  if (n < 0) return [];
  const out: DateStr[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) out[i] = addDays(from, i);
  return out;
}
