/**
 * Turkce sayi sozlugu.
 *
 * Konusma tanima "kirk bin" ifadesini cogu zaman RAKAMA CEVIRMEZ --
 * ozellikle telefon mikrofonunda ve arka plan gurultusunde. Parser
 * her iki bicimi de kabul etmezse dikte kullanicinin yarisinda basarisiz
 * olur ve ozellik guvenilmez sayilir.
 *
 * Degerler `normalize()` gecmis bicimde yazilir: aksansiz, kucuk harf
 * ("kirk", "yuz", "bes"). Eslestirme oncesi girdi de normalize edilir,
 * boylece "KIRK" ve "Kırk" ayni anahtara duser.
 */

/** Birler + on katlari. Carpan degil, dogrudan eklenen degerler. */
export const UNIT_WORDS: Readonly<Record<string, number>> = {
  sifir: 0,
  bir: 1,
  iki: 2,
  uc: 3,
  dort: 4,
  bes: 5,
  alti: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
  yirmi: 20,
  otuz: 30,
  kirk: 40,
  elli: 50,
  altmis: 60,
  yetmis: 70,
  seksen: 80,
  doksan: 90,
};

/**
 * Carpanlar. "yuz" ve "bin" tek basina da gecerlidir:
 * "yuz lira" = 100, "bin lira" = 1000 (onlerinde sayi olmasa da).
 */
export const MULTIPLIER_WORDS: Readonly<Record<string, number>> = {
  yuz: 100,
  bin: 1_000,
  milyon: 1_000_000,
  milyar: 1_000_000_000,
};

/**
 * "buçuk" = +0.5 birim. "iki bucuk milyon" gibi kullanimlar icin
 * carpandan ONCE uygulanir.
 */
export const HALF_WORD = "bucuk";

/** Ceyrek: "bir ceyrek" nadir ama "ceyrek milyon" duyulur. */
export const QUARTER_WORD = "ceyrek";

export function isNumberWord(token: string): boolean {
  return (
    token in UNIT_WORDS ||
    token in MULTIPLIER_WORDS ||
    token === HALF_WORD ||
    token === QUARTER_WORD
  );
}
