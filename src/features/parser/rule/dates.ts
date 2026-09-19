import { normalize } from "@/lib/text/normalize";
import {
  addDays,
  isoWeekday,
  fromParts,
  toParts,
  daysInMonth,
} from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";
import type { Span } from "../types";

export interface DateMatch {
  date: DateStr;
  confidence: number;
  span: Span | null;
  matchedPhrase: string;
}

/** Ay adları — ISO ay numarasıyla (1-12). `normalize()` geçmiş biçimde. */
const MONTHS: Readonly<Record<string, number>> = {
  ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6,
  temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
};

/** Hafta günleri — ISO gün numarasıyla (Pazartesi=1 … Pazar=7). */
const WEEKDAYS: Readonly<Record<string, number>> = {
  pazartesi: 1, sali: 2, carsamba: 3, persembe: 4,
  cuma: 5, cumartesi: 6, pazar: 7,
};

/** Göreli gün ifadeleri — bugünden kaç gün sapma. */
const RELATIVE_DAYS: Readonly<Record<string, number>> = {
  bugun: 0,
  dun: -1,
  "evvelsi gun": -2,
  "onceki gun": -2,
  "evvelki gun": -2,
  yarin: 1,
  "obur gun": 2,
};

function findPhraseSpan(rawText: string, phrase: string): Span | null {
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawText)) !== null) {
    const n = normalize(m[0].replace(/[^\p{L}\p{N}]/gu, ""));
    if (n === phrase || n.startsWith(phrase)) {
      return { start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}

/**
 * Cümleden tarihi çıkarır. Bulunamazsa BUGÜN varsayılır.
 *
 * ── NEDEN VARSAYILAN BUGÜN ──
 *
 * Dikte anlık kullanılır: kullanıcı harcamayı yaptıktan hemen sonra
 * söyler. "200 tl yemek aldım" cümlesinde tarih yoksa bugün demektir.
 * Tarihi null bırakıp kullanıcıya sormak, en sık durumu en zahmetli
 * hale getirirdi.
 *
 * Varsayılan olduğu için güveni düşük (0.5) işaretlenir — onay kartı
 * bunu "varsayıldı" diye gösterebilsin.
 *
 * ── GELECEK TARİH KORUMASI ──
 *
 * "pazartesi" gibi yalın gün adı GEÇMİŞE yorumlanır: kullanıcı olmuş
 * bir harcamayı kaydediyor, gelecek planı değil. "gelecek pazartesi"
 * açıkça söylenirse ileri gidilir.
 */
export function findDate(rawText: string, today: DateStr): DateMatch {
  const text = normalize(rawText);

  // ── 1. Göreli gün ifadeleri: bugün, dün, yarın ──
  // Uzun ifade önce denenir ("evvelsi gun" varken "gun"e düşmemeli).
  const relativeEntries = Object.entries(RELATIVE_DAYS).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [phrase, offset] of relativeEntries) {
    if (text.includes(phrase)) {
      return {
        date: addDays(today, offset),
        confidence: 0.95,
        span: findPhraseSpan(rawText, phrase.split(" ")[0]),
        matchedPhrase: phrase,
      };
    }
  }

  // ── 2. "geçen hafta" / "geçen ay" ──
  if (text.includes("gecen hafta")) {
    return {
      date: addDays(today, -7),
      confidence: 0.7,
      span: findPhraseSpan(rawText, "gecen"),
      matchedPhrase: "geçen hafta",
    };
  }
  if (text.includes("gecen ay")) {
    const p = toParts(today);
    const prevMonth = p.month === 1 ? 12 : p.month - 1;
    const prevYear = p.month === 1 ? p.year - 1 : p.year;
    // Ayın günü korunur; kısa ayda taşmayı `fromParts` engellemez, bu
    // yüzden güvenli tarafta 28'e kırpılır.
    const day = Math.min(p.day, 28);
    return {
      date: fromParts(prevYear, prevMonth, day),
      confidence: 0.6,
      span: findPhraseSpan(rawText, "gecen"),
      matchedPhrase: "geçen ay",
    };
  }

  // ── 3. "15 mart" biçimi ──
  const dayMonth = text.match(
    /(\d{1,2})\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)/,
  );
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = MONTHS[dayMonth[2]];
    const p = toParts(today);

    // Yıl belirtilmemişse: ay henüz gelmediyse geçen yıl varsayılır.
    // "15 aralık" Ocak ayında söylenirse geçen aralık kastedilir.
    const year = month > p.month ? p.year - 1 : p.year;

    // ★ TAKVİM DOĞRULAMASI — `day <= 31` YETMEZ.
    //
    // "31 şubat" duyulduğunda 1..31 kontrolü geçer ve `fromParts`
    // sessizce "2026-02-31" dizesini üretir. `fromParts` biçimlendirme
    // yapar, DOĞRULAMA YAPMAZ: markalı `DateStr` tipinin kapısı olan
    // `isDateStr` atlanmış olur ve takvimde olmayan bir tarih
    // uygulamaya girer. Postgres bunu en sonunda reddeder ama o
    // noktada kullanıcı zaten kaydet'e basmıştır.
    //
    // Artık yıl da buraya dahil: 2026 artık yıl olmadığı için
    // "29 şubat" da geçersizdir ve `daysInMonth` bunu bilir.
    if (day >= 1 && day <= daysInMonth(year, month)) {
      return {
        date: fromParts(year, month, day),
        confidence: 0.85,
        span: null,
        matchedPhrase: `${day} ${dayMonth[2]}`,
      };
    }

    // Geçersiz gün/ay birleşimi: tarih UYDURULMAZ. Aşağıdaki
    // kurallara düşer ve sonunda bugüne varsayılır; onay kartı
    // kullanıcıya tarihi gösterir ve düzeltebilir.
  }

  // ── 4. Hafta günü adı: "pazartesi" → en son geçen pazartesi ──
  //
  // UZUN AD ÖNCE denenir: "cumartesi" metni "cuma"yı da içerir ve
  // sözlük sırasıyla taransaydı cumartesi her zaman cuma sanılırdı.
  // Aynı tuzak "pazar" / "pazartesi" çiftinde de var.
  const weekdayEntries = Object.entries(WEEKDAYS).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [name, iso] of weekdayEntries) {
    if (!text.includes(name)) continue;
    const isFuture = text.includes("gelecek") || text.includes("onumuzdeki");
    const todayIso = isoWeekday(today);
    let delta = iso - todayIso;
    if (isFuture) {
      if (delta <= 0) delta += 7;
    } else {
      // Geçmişe bak: bugünse bugün, değilse en son geçen o gün.
      if (delta > 0) delta -= 7;
    }
    return {
      date: addDays(today, delta),
      confidence: 0.75,
      span: findPhraseSpan(rawText, name),
      matchedPhrase: name,
    };
  }

  // ── 5. Varsayılan: bugün ──
  return { date: today, confidence: 0.5, span: null, matchedPhrase: "bugün (varsayılan)" };
}
