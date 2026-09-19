import { toParts, todayStr, addDays } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";

/**
 * Turkce tarih etiketleri.
 *
 * Diziler 0. elemani BOS birakir ki ISO indeksle (ay 1-12, gun 1-7)
 * dogrudan hizalansinlar. `MONTHS[3]` = "Mart". Kaydirma aritmetigi
 * (`MONTHS[month - 1]`) her cagri noktasinda tekrarlanacak ve bir
 * yerde unutulacakti.
 */
export const MONTHS = [
  "", "Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran",
  "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik",
] as const;

export const MONTHS_TR = [
  "", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

export const WEEKDAYS_TR = [
  "", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar",
] as const;

/**
 * "19 Eylül 2026" bicimi; bugun ve dun icin ozel etiket.
 *
 * Bugunun tarihini tam yazmak bilgi katmaz -- kullanici hangi gunde
 * oldugunu biliyor. "Bugun" demek listeyi tarayan goze daha hizli
 * konum verir.
 */
export function formatLongDate(date: DateStr, today: DateStr = todayStr()): string {
  if (date === today) return "Bugün";
  if (date === addDays(today, -1)) return "Dün";

  const { year, month, day } = toParts(date);
  const { year: todayYear } = toParts(today);

  // Ayni yil icinde yil yazilmaz: "19 Eylül" yeterli ve daha sakin.
  return year === todayYear
    ? `${day} ${MONTHS_TR[month]}`
    : `${day} ${MONTHS_TR[month]} ${year}`;
}

/** "Eylül 2026" -- ay basligi. */
export function formatMonthTitle(date: DateStr): string {
  const { year, month } = toParts(date);
  return `${MONTHS_TR[month]} ${year}`;
}

/** "19.09.2026" -- kompakt bicim, tablolarda. */
export function formatShortDate(date: DateStr): string {
  const { year, month, day } = toParts(date);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}
