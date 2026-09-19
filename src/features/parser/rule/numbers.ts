import { normalize } from "@/lib/text/normalize";
import { asKurus, liraToKurus } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { Span } from "../types";
import {
  UNIT_WORDS,
  MULTIPLIER_WORDS,
  HALF_WORD,
  QUARTER_WORD,
  isNumberWord,
} from "./numbers-words";

/**
 * Rakamla yazılmış sayıyı çözer. "40.000" → 40000, "1.250,50" → 1250.5
 *
 * Belirsizlik kuralı (money.ts `parseTRYInput` ile aynı): son ayraçtan
 * sonra 3 hane varsa o ayraç BİNLİK ("40.000" = kırk bin), 1-2 hane
 * varsa ONDALIK ("1250,50"). Bu kural olmadan "40.000" kırk lira
 * sayılırdı ve kullanıcının maaşı bin kat küçük kaydedilirdi.
 */
export function parseDigitNumber(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);

  let intPart: string;
  let fracPart = "";

  if (lastSep === -1) {
    intPart = s;
  } else {
    const tail = s.slice(lastSep + 1);
    if (tail.length === 3) {
      intPart = s.replace(/[.,]/g, "");
    } else if (tail.length === 1 || tail.length === 2) {
      intPart = s.slice(0, lastSep).replace(/[.,]/g, "");
      fracPart = tail;
    } else {
      return null;
    }
  }

  // Ayraç yapısı doğrulaması: "1.23.456" gibi bozuk gruplama sessizce
  // sayıya çevrilmemeli — kullanıcı yanlış tutar kaydettiğini fark etmez.
  const sepCount = (s.match(/[.,]/g) ?? []).length;
  if (sepCount > 1) {
    const tailLen = s.length - lastSep - 1;
    const groupPart = tailLen === 3 ? s : s.slice(0, lastSep);
    const groupSep = groupPart.includes(".") ? "." : ",";
    const otherSep = groupSep === "." ? "," : ".";
    if (groupPart.includes(otherSep)) return null;
    const groups = groupPart.split(groupSep);
    if (groups.length < 2) return null;
    if (!/^\d{1,3}$/.test(groups[0])) return null;
    if (!groups.slice(1).every((g) => /^\d{3}$/.test(g))) return null;
  }

  if (intPart === "" || !/^\d+$/.test(intPart)) return null;
  const value = Number(fracPart ? `${intPart}.${fracPart}` : intPart);
  return Number.isFinite(value) ? value : null;
}

/**
 * Yazıyla yazılmış Türkçe sayıyı çözer. ["kirk","bin"] → 40000
 *
 * ── ALGORİTMA ──
 *
 * Türkçe sayılar toplamalı-çarpmalı: "iki milyon beş yüz bin" =
 * (2 × 1.000.000) + (5 × 100 × 1.000). İki birikeç tutulur:
 *   `current` — işlenmekte olan çarpan grubu
 *   `total`   — tamamlanmış grupların toplamı
 *
 * "bin" ve üzeri bir çarpan görülünce `current` o çarpanla çarpılıp
 * `total`'e aktarılır ve `current` sıfırlanır. "yüz" grup KAPATMAZ,
 * çünkü "yüz elli" tek gruptur (100 + 50).
 */
export function parseNumberWords(tokens: readonly string[]): number | null {
  if (tokens.length === 0) return null;

  let total = 0;
  let current = 0;
  let sawAny = false;
  let pendingHalf = 0;

  for (const rawToken of tokens) {
    const t = normalize(rawToken);

    if (t in UNIT_WORDS) {
      current += UNIT_WORDS[t];
      sawAny = true;
      continue;
    }

    if (t === HALF_WORD) {
      // "iki buçuk" → 2.5 ; "iki buçuk milyon" → 2.5 × 1.000.000
      pendingHalf = 0.5;
      sawAny = true;
      continue;
    }

    if (t === QUARTER_WORD) {
      pendingHalf = 0.25;
      sawAny = true;
      continue;
    }

    if (t in MULTIPLIER_WORDS) {
      const mult = MULTIPLIER_WORDS[t];
      // Tek başına çarpan: "bin lira" = 1000, "yüz lira" = 100.
      const base = (current === 0 ? 1 : current) + pendingHalf;
      pendingHalf = 0;

      if (mult === 100) {
        // "yüz" grubu kapatmaz: "yüz elli" → 150.
        current = base * mult;
      } else {
        total += base * mult;
        current = 0;
      }
      sawAny = true;
      continue;
    }

    // Sayı olmayan kelime: dizi sayı olarak geçersiz.
    return null;
  }

  if (!sawAny) return null;
  const value = total + current + pendingHalf;
  if (value > 0) return value;
  // "sıfır" geçerli bir sayıdır ama tutar olarak kullanılmaz;
  // ayrım findAmount'un işi.
  return tokens.some((t) => normalize(t) === "sifir") ? 0 : null;
}

export interface AmountMatch {
  kurus: Kurus;
  span: Span;
  /** Cümlede açıkça para birimi geçti mi — güven skorunu etkiler. */
  hasCurrency: boolean;
}

/** Para birimi belirteçleri. `tele` STT'nin "TL"yi sıkça yazdığı biçim. */
const CURRENCY_RE = /^(tl|tl\.|try|lira|lirayi|liraya|₺|tele|lirasi)$/;

/**
 * Tutar olarak SAYILMAYACAK bağlamlar.
 *
 * "15 mart" tarih, "saat 14" saat, "3 kişi" adet. Bunları tutar
 * sanmak dikteyi güvenilmez yapar: kullanıcı "15 mart'ta kira ödedim"
 * dediğinde 15 TL kaydedilmemeli.
 */
const AFTER_BLOCKLIST = new Set([
  "ocak", "subat", "mart", "nisan", "mayis", "haziran",
  "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik",
  "kisi", "adet", "tane", "kez", "defa", "gun", "gunde",
  "saat", "saatte", "dakika", "dakikada", "saniye",
  "yil", "yilinda", "ay", "ayinda", "hafta", "haftada",
  "yasinda", "derece", "km", "kilometre", "kilo", "gram", "litre",
]);

const BEFORE_BLOCKLIST = new Set(["saat", "saatte", "dakika"]);

interface PositionedToken {
  raw: string;
  norm: string;
  start: number;
  end: number;
}

function tokenizeWithPositions(text: string): PositionedToken[] {
  const tokens: PositionedToken[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      raw: m[0],
      norm: normalize(m[0].replace(/[^\p{L}\p{N}.,₺]/gu, "")),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return tokens;
}

/**
 * Cümleden tutarı bulur.
 *
 * ── ADAY SIRALAMA ──
 *
 * Bir cümlede birden fazla sayı olabilir: "5 dakika önce 200 tl ödedim".
 * Para birimi ile İŞARETLENMİŞ aday her zaman kazanır; işaretsizler
 * ancak başka aday yoksa kullanılır. Bu, "5 dakika"yı tutar sanmayı
 * yapısal olarak engeller.
 */
export function findAmount(text: string): AmountMatch | null {
  const candidates: AmountMatch[] = [];
  const tokens = tokenizeWithPositions(text);

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // ── Aday 1: rakamla yazılmış sayı ──
    // "200₺" gibi bitişik para birimini ayır.
    const digitMatch = tok.raw.match(/^([\d.,]+)\s*(₺|tl)?[.,]?$/i);
    if (digitMatch) {
      let value = parseDigitNumber(digitMatch[1]);
      if (value !== null && value > 0) {
        const attached = Boolean(digitMatch[2]);
        let lastIdx = i;

        // ── KARIŞIK BİÇİM: rakam + çarpan kelimesi ──
        // "15 bin tl", "40 bin lira", "2 milyon" konuşma dilinde
        // rakamla yazılandan daha sık duyulur. Yalnızca rakamı okumak
        // tutarı BİN KAT küçük kaydeder ve kullanıcı bunu fark etmez.
        const nextTok = tokens[i + 1];
        if (nextTok && nextTok.norm in MULTIPLIER_WORDS) {
          value *= MULTIPLIER_WORDS[nextTok.norm];
          lastIdx = i + 1;
        }

        const afterIdx = lastIdx + 1;
        const next = tokens[afterIdx]?.norm ?? "";
        const prev = tokens[i - 1]?.norm ?? "";
        const currencyNext = CURRENCY_RE.test(next);
        const hasCurrency = attached || currencyNext;
        const blocked =
          (!hasCurrency && AFTER_BLOCKLIST.has(next)) ||
          (!hasCurrency && BEFORE_BLOCKLIST.has(prev));
        if (!blocked) {
          candidates.push({
            kurus: liraToKurus(value),
            span: {
              start: tok.start,
              end: currencyNext ? tokens[afterIdx].end : tokens[lastIdx].end,
            },
            hasCurrency,
          });
        }
        i = lastIdx;
      }
      continue;
    }

    // ── Aday 2: yazıyla yazılmış sayı dizisi ──
    if (!isNumberWord(tok.norm)) continue;
    let j = i;
    while (j < tokens.length && isNumberWord(tokens[j].norm)) j++;
    const words = tokens.slice(i, j).map((t) => t.norm);
    const value = parseNumberWords(words);
    if (value !== null && value > 0) {
      const next = tokens[j]?.norm ?? "";
      const prev = tokens[i - 1]?.norm ?? "";
      const hasCurrency = CURRENCY_RE.test(next);
      const blocked =
        (!hasCurrency && AFTER_BLOCKLIST.has(next)) ||
        (!hasCurrency && BEFORE_BLOCKLIST.has(prev));
      if (!blocked) {
        candidates.push({
          kurus: liraToKurus(value),
          span: {
            start: tokens[i].start,
            end: hasCurrency ? tokens[j].end : tokens[j - 1].end,
          },
          hasCurrency,
        });
      }
    }
    i = j - 1;
  }

  if (candidates.length === 0) return null;

  // Para birimli aday kazanır; eşitlikte ilk geçen.
  const withCurrency = candidates.filter((c) => c.hasCurrency);
  const pool = withCurrency.length > 0 ? withCurrency : candidates;
  return pool[0];
}

/** Tutarı kuruşa çevirirken güvenli üst sınırı aşmayı engeller. */
export function safeKurus(value: number): Kurus | null {
  try {
    return asKurus(Math.round(value));
  } catch {
    return null;
  }
}
