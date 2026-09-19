import type { DateStr } from "@/lib/date/types";
import type { Kurus } from "@/lib/money/types";

/**
 * Parser'in turettigi TASLAK islem.
 *
 * Bu bir kayit DEGIL, bir TAHMINDIR. Her alan null olabilir ve hicbiri
 * dogrudan veritabanina yazilmaz: kullanici DraftCard'da onaylayana
 * kadar hicbir sey kaydedilmez.
 *
 * Bos birakmak uydurmaktan iyidir. Parser bir alandan emin degilse
 * null dondurur ve onay karti kullaniciya sorar; yanlis bir tahmini
 * sessizce kaydetmek, kullanicinin fark etmedigi bozuk veri uretir.
 */
export interface DraftTransaction {
  kind: "income" | "expense" | "transfer" | null;
  amountKurus: Kurus | null;
  date: DateStr | null;
  categoryId: string | null;
  accountId: string | null;
  counterAccountId: string | null;
  note: string | null;
}

export type DraftField = keyof DraftTransaction;

/** Bir alanin ham metindeki kaynagi -- [start, end) karakter indisi. */
export interface Span {
  start: number;
  end: number;
}

/**
 * Parser'in gorebilecegi kullanici verisi.
 *
 * Kategoriler ve hesaplar KULLANICIYA OZELDIR: yerlesik sozluk herkes
 * icin ayni ("market" -> market kategorisi) ama kullanici kategorisini
 * "Gida" diye adlandirmis olabilir ya da "migros" kelimesini kendi
 * kategorisine baglamis olabilir. Parser bu baglam olmadan kisisellesmez.
 */
export interface ParseContext {
  categories: readonly ParseCategory[];
  accounts: readonly ParseAccount[];
  /** Bugunun tarihi. Enjekte edilir ki testler sabit gune kilitlenebilsin. */
  today: DateStr;
  /** Varsayilan hesap -- cumlede hesap gecmezse bu kullanilir. */
  defaultAccountId: string | null;
}

export interface ParseCategory {
  id: string;
  name: string;
  kind: "income" | "expense";
  /** Kullanicinin bu kategoriye bagladigi ek anahtar kelimeler. */
  keywords: readonly string[];
}

export interface ParseAccount {
  id: string;
  name: string;
  kind: "cash" | "bank" | "credit_card";
}

/**
 * Alan basina guven (0..1) + toplam.
 *
 * Alan basina ayri olmasi SART: tutari %95 guvenle bulup kategoriyi
 * hic bulamamak tipik durumdur. Tek bir skor bu ikisini ortalar ve
 * onay karti hangi alani vurgulayacagini bilemez.
 */
export type FieldConfidence = Record<DraftField, number>;

export interface ParseResult {
  draft: DraftTransaction;
  confidence: FieldConfidence;
  /** Toplam guven -- zincirin LLM'e dusup dusmeyecegine bu karar verir. */
  overall: number;
  /** "Bu alani cumlenin surasindan cikardim" -- onay kartinda gosterilir. */
  spans: Partial<Record<DraftField, Span>>;
  /** Kullaniciya gosterilecek uyarilar (TR metin). */
  warnings: string[];
  /** Hangi parser uretti -- hata ayiklama ve telemetri icin. */
  parserName: string;
}

/**
 * Takilabilir parser arayuzu.
 *
 * Kural motoru bunu senkron uygular ama imza `Promise` doner: ileride
 * eklenecek Gemini parser'i ag cagrisi yapacak ve o gun arayuzun
 * degismesi TUM cagri noktalarini kirardi. Bugun `async` yazmak
 * bedava, yarin degistirmek pahali.
 */
export interface TransactionParser {
  readonly name: string;
  parse(text: string, ctx: ParseContext): Promise<ParseResult>;
}

/**
 * Bu esigin altinda kalan sonuc "emin degil" sayilir.
 *
 * Zincir fabrikasi (index.ts) bu durumda -- ve yalnizca bu durumda --
 * kayitli bir LLM parser'a duser. Esik yuksek tutuldu: kural motoru
 * emin oldugunda ag cagrisi yapmak hem yavas hem masrafli.
 */
export const CONFIDENCE_THRESHOLD = 0.6;

/** Hicbir sey bulunamamis bos taslak. */
export const EMPTY_DRAFT: DraftTransaction = {
  kind: null,
  amountKurus: null,
  date: null,
  categoryId: null,
  accountId: null,
  counterAccountId: null,
  note: null,
};

export const ZERO_CONFIDENCE: FieldConfidence = {
  kind: 0,
  amountKurus: 0,
  date: 0,
  categoryId: 0,
  accountId: 0,
  counterAccountId: 0,
  note: 0,
};
