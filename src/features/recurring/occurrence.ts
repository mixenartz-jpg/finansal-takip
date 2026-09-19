import {
  addDays,
  addMonths,
  daysInMonth,
  fromParts,
  isoWeekday,
  toParts,
} from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";
import { WEEKDAYS_TR, MONTHS_TR, dayWithSuffix } from "@/lib/ui/tr";
import type { RecurringRule } from "./types";

/**
 * Tek seferde üretilecek azami vade sayısı.
 *
 * ── NEDEN SINIR VAR ──
 *
 * Uygulama aylarca açılmadıysa `dueOccurrences` yüzlerce vade
 * üretebilir ve kullanıcı onay ekranında boğulur. Daha kötüsü, hatalı
 * bir kural (örn. bitiş tarihi geçmişte ama `lastRunDate` çok eski)
 * döngüyü uzun süre çevirir.
 *
 * Sınıra dayanılırsa kalanlar bir sonraki açılışta gelir — veri
 * kaybolmaz, yalnızca parça parça sunulur.
 */
const MAX_OCCURRENCES = 60;

/**
 * Bir kuralın belirtilen tarihten SONRAKİ ilk vadesi.
 *
 * `after` null ise kural hiç çalışmamış demektir ve arama
 * `startDate`'ten (dahil) başlar.
 *
 * Duraklatılmış ya da bitmiş kural için `null` döner.
 */
export function nextOccurrence(
  rule: RecurringRule,
  after: DateStr | null,
): DateStr | null {
  if (rule.pausedAt) return null;

  let candidate =
    after === null
      ? firstOnOrAfter(rule, rule.startDate)
      : firstStrictlyAfter(rule, after);

  // ── ★ BAŞLANGICA KADAR İLERLET ──
  //
  // `firstStrictlyAfter` yalnızca TEK dönem ilerletir. `after`
  // (yani `lastRunDate`) başlangıçtan bir dönemden fazla geride
  // kalmışsa, üretilen aday hâlâ `startDate`'in önüne düşer.
  //
  // Bu durumda `null` döndürmek KALICI SUSMA demektir: dönen null
  // "bu kuralın vadesi yok" ile aynı şeye benzer, `dueOccurrences`
  // döngüyü kırar, imleç bir daha ilerlemez ve aktif bir kural
  // arayüzde "bitti" görünür. Sessiz ve kalıcı olduğu için
  // kullanıcının fark etmesi imkânsıza yakın.
  //
  // Bu duruma normal bir düzenleme akışıyla girilebilir: Ocak
  // vadesi onaylanır, sonra kural düzenlenip başlangıç Haziran'a
  // çekilir (`useUpdateRule` `last_run_date`'e dokunmaz).
  //
  // Çözüm: aday başlangıca ulaşana kadar ilerlemeye devam et.
  // Döngü `MAX_OCCURRENCES` ile sınırlı — başlangıcı çok uzak bir
  // geleceğe alınmış bir kural askıda bırakmak yerine null döner.
  let guard = 0;
  while (candidate !== null && candidate < rule.startDate) {
    if (++guard > MAX_OCCURRENCES) return null;
    candidate = firstStrictlyAfter(rule, candidate);
  }

  if (candidate === null) return null;
  if (rule.endDate && candidate > rule.endDate) return null;

  return candidate;
}

/**
 * `from` tarihinde ya da sonrasındaki ilk vade.
 *
 * Kuralın ilk çalışmasında kullanılır: başlangıç günü tam vade
 * gününe denk geliyorsa o gün geçerlidir, bir sonraki döneme
 * atlanmaz.
 */
function firstOnOrAfter(rule: RecurringRule, from: DateStr): DateStr | null {
  switch (rule.freq) {
    case "weekly": {
      const currentIso = isoWeekday(from);
      const delta = (rule.dayOf - currentIso + 7) % 7;
      return addDays(from, delta);
    }

    case "monthly": {
      const { year, month } = toParts(from);
      const thisMonth = clampedDay(year, month, rule.dayOf);
      // Bu ayın vadesi henüz geçmediyse o geçerli.
      if (thisMonth >= from) return thisMonth;
      const next = addMonths(from, 1);
      const np = toParts(next);
      return clampedDay(np.year, np.month, rule.dayOf);
    }

    case "yearly": {
      if (rule.monthOf === null) return null;
      const { year } = toParts(from);
      const thisYear = clampedDay(year, rule.monthOf, rule.dayOf);
      if (thisYear >= from) return thisYear;
      return clampedDay(year + 1, rule.monthOf, rule.dayOf);
    }
  }
}

/**
 * `after` tarihinden KESİNLİKLE sonraki ilk vade.
 *
 * Son üretimden sonrasını ararken kullanılır: aynı tarihi iki kez
 * üretmemek için sınır dışlayıcıdır.
 *
 * ── AYIN GÜNÜ NEDEN `after`'DAN TÜRETİLMEZ ──
 *
 * "Her ayın 31'i" kuralı şubatta 28'e kırpılır. Sonraki vadeyi
 * kırpılmış tarihten (28 Şubat) türetirsek mart da 28 olur ve kural
 * kalıcı olarak kayar. Bu yüzden ay ilerletilir ama GÜN daima
 * `rule.dayOf`'tan yeniden hesaplanır.
 */
function firstStrictlyAfter(rule: RecurringRule, after: DateStr): DateStr | null {
  switch (rule.freq) {
    case "weekly":
      return addDays(after, 7);

    case "monthly": {
      // `addMonths` sonucu daima SONRAKİ ayın 1'idir; kırpma en fazla
      // o ayın son gününe düşürür. Dolayısıyla üretilen tarih her
      // zaman `after`'dan büyüktür ve "geriye düştü mü" diye ayrıca
      // bakmaya gerek yok — 2024-2027 aralığında dayOf 28..31 için
      // tüm kombinasyonlar tarandı, geriye düşen tek bir durum yok.
      const next = addMonths(after, 1);
      const { year, month } = toParts(next);
      return clampedDay(year, month, rule.dayOf);
    }

    case "yearly": {
      if (rule.monthOf === null) return null;
      const { year } = toParts(after);
      const candidate = clampedDay(year + 1, rule.monthOf, rule.dayOf);
      return candidate > after ? candidate : null;
    }
  }
}

/**
 * Ayın gününü o ayın gerçek uzunluğuna kırpar.
 *
 * "Her ayın 31'i" şubatta 28 (artık yılda 29) olur. Kırpmasaydık
 * `fromParts(2026, 2, 31)` → "2026-02-31" üretirdik: takvimde olmayan
 * bir tarih. Faz 1'de parser'da aynı hata yakalanmıştı; burada baştan
 * engelleniyor.
 */
function clampedDay(year: number, month: number, day: number): DateStr {
  return fromParts(year, month, Math.min(day, daysInMonth(year, month)));
}

/**
 * Bugüne kadar vadesi gelmiş ve henüz üretilmemiş tüm tarihler.
 *
 * Kullanıcı uygulamayı bir ay açmadıysa geçmiş vadeler birikir;
 * hepsi listelenir ki kullanıcı tek tek onaylayabilsin.
 */
export function dueOccurrences(
  rule: RecurringRule,
  today: DateStr,
): DateStr[] {
  if (rule.pausedAt) return [];

  const result: DateStr[] = [];
  let cursor = rule.lastRunDate;

  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    const next = nextOccurrence(rule, cursor);
    if (next === null) break;
    // Gelecekteki vade "gelmiş" sayılmaz.
    if (next > today) break;
    result.push(next);
    cursor = next;
  }

  return result;
}

/** Kuralın Türkçe özeti — listede sıklığı okunur kılar. */
export function describeSchedule(rule: RecurringRule): string {
  switch (rule.freq) {
    case "weekly":
      return `Her ${WEEKDAYS_TR[rule.dayOf] ?? "?"}`;

    case "monthly":
      // 31 hiçbir ayda garanti değil; "son günü" demek hem doğru hem
      // kullanıcının kastettiği şey.
      return rule.dayOf === 31
        ? "Her ayın son günü"
        : `Her ayın ${dayWithSuffix(rule.dayOf)}`;

    case "yearly":
      return rule.monthOf === null
        ? "Her yıl"
        : `Her yıl ${rule.dayOf} ${MONTHS_TR[rule.monthOf]}`;
  }
}
