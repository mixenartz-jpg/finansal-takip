import { normalize } from "@/lib/text/normalize";
import type { ParseAccount, Span } from "../types";

export interface AccountMatch {
  accountId: string;
  accountName: string;
  confidence: number;
  span: Span | null;
}

/**
 * Hesap TÜRÜNE işaret eden kelimeler.
 *
 * Kullanıcı hesabının adını söylemez, türünü söyler: "kartla ödedim",
 * "nakit verdim". Bu sözlük o kelimeleri hesap türüne bağlar; hangi
 * hesabın kullanılacağı sonra o türdeki ilk hesaptan seçilir.
 */
const KIND_HINTS: Readonly<Record<string, ParseAccount["kind"]>> = {
  kart: "credit_card",
  kartla: "credit_card",
  karttan: "credit_card",
  kredikarti: "credit_card",
  "kredi karti": "credit_card",
  visa: "credit_card",
  mastercard: "credit_card",

  nakit: "cash",
  nakitle: "cash",
  nakden: "cash",
  elden: "cash",
  cebimden: "cash",

  banka: "bank",
  bankadan: "bank",
  hesaptan: "bank",
  hesabimdan: "bank",
  havale: "bank",
  eft: "bank",
  iban: "bank",
};

function findSpan(rawText: string, phrase: string): Span | null {
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
 * Cümleden hesabı bulur; bulunamazsa varsayılan hesap kullanılır.
 *
 * ── ÖNCELİK SIRASI ──
 *
 * 1. Hesabın kendi ADI geçiyor mu ("Garanti", "Ziraat")
 * 2. Hesap TÜRÜ ima ediliyor mu ("kartla", "nakit")
 * 3. Varsayılan hesap
 *
 * Ad önce gelir çünkü daha spesifik: kullanıcının iki kartı varsa
 * "Garanti kartıyla" demesi hangisini kastettiğini belirtir, yalın
 * "kartla" demesi belirtmez.
 *
 * Varsayılan kullanıldığında güven düşük (0.4) işaretlenir — onay
 * kartı bunu "varsayıldı" diye göstersin ve kullanıcı yanlışsa
 * düzeltebilsin.
 */
export function findAccount(
  rawText: string,
  accounts: readonly ParseAccount[],
  defaultAccountId: string | null,
): AccountMatch | null {
  if (accounts.length === 0) return null;
  const text = normalize(rawText);

  // ── 1. Hesap adı ──
  // Uzun ad önce: "Garanti Kart" varken "Garanti"ye düşmemeli.
  const byName = accounts
    .filter((a) => {
      const n = normalize(a.name);
      return n.length >= 3 && text.includes(n);
    })
    .sort((a, b) => b.name.length - a.name.length)[0];

  if (byName) {
    return {
      accountId: byName.id,
      accountName: byName.name,
      confidence: 0.95,
      span: findSpan(rawText, normalize(byName.name)),
    };
  }

  // ── 2. Tür ipucu ──
  const hintEntries = Object.entries(KIND_HINTS).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [hint, kind] of hintEntries) {
    if (!text.includes(hint)) continue;
    const match = accounts.find((a) => a.kind === kind);
    if (match) {
      return {
        accountId: match.id,
        accountName: match.name,
        confidence: 0.8,
        span: findSpan(rawText, hint.split(" ")[0]),
      };
    }
  }

  // ── 3. Varsayılan ──
  const fallback =
    accounts.find((a) => a.id === defaultAccountId) ?? accounts[0];
  return {
    accountId: fallback.id,
    accountName: fallback.name,
    confidence: 0.4,
    span: null,
  };
}
