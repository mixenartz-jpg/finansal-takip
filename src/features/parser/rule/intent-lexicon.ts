/**
 * Gelir/gider fiil sözlüğü.
 *
 * Tüm anahtarlar `normalize()` geçmiş biçimde: aksansız, küçük harf.
 * "ödedim" → "odedim", "kazandım" → "kazandim".
 *
 * ── NEDEN KÖK DEĞİL TAM BİÇİM ──
 *
 * Türkçe sondan eklemeli; "öde" kökünden "ödedim/ödemiştim/ödeyeceğim"
 * türer. Tam bir morfolojik çözümleyici yazmak bu uygulamanın işi değil
 * — konuşulan cümleler kısa ve kalıplaşmış. Bunun yerine önek eşleşmesi
 * kullanılır (`startsWith`) ve sözlükte KÖKE yakın biçimler tutulur:
 * "ode" öneki "odedim", "odedik", "odeyecegim" hepsini yakalar.
 *
 * Yanlış pozitif riski bilinçli kabul edildi: "odeme geldi" hem "ode"
 * (gider) hem "geldi" (gelir) içerir. Çözüm skor tabanlı — tek bir
 * eşleşme değil, tüm sinyallerin ağırlıklı toplamı karar verir.
 */

/** Güçlü gider sinyalleri. Tek başına karar verdirir. */
export const EXPENSE_STRONG: readonly string[] = [
  "odedi", "odedim", "odedik", "odeme yaptim",
  "harcadi", "harcadim", "harcadik",
  "verdim", "verdik", "verdi",
  "satin al",
  "gitti", "cikti",
  "borcland",
  "fatura odedi",
];

/**
 * Zayıf gider sinyalleri. Başka sinyalle birleşince güçlenir.
 *
 * "aldim/aldik/aldi" BİLİNÇLİ OLARAK BURADA DEĞİL: yönü nesnesi
 * belirler, sözlük değil. Buraya konsaydı yalın "aldım" otomatik
 * gider sayılır ve intent.ts'teki belirsizlik dalı hiç çalışmazdı —
 * "maaşımı aldım" yanlış sınıflanırdı.
 */
export const EXPENSE_WEAK: readonly string[] = [
  "yaptim", "yaptik",
  "gider", "masraf", "harcama",
  "kesildi", "dustu",
];

/** Güçlü gelir sinyalleri. */
export const INCOME_STRONG: readonly string[] = [
  "geldi", "gelmis",
  "yatti", "yatirdi", "yatirildi",
  "kazandim", "kazandik", "kazandi",
  "aldigim maas", "maasim yatti",
  "gelir", "kazanc",
  "odendi bana", "bana odendi",
  "girdi hesabima", "hesabima girdi",
  "tahsil ettim", "tahsil edildi",
  "iade", "geri geldi",
];

/** Zayıf gelir sinyalleri. */
export const INCOME_WEAK: readonly string[] = [
  "maas", "prim", "ikramiye", "bonus", "temettu", "faiz",
  "para geldi", "ek gelir",
];

/**
 * ★ "ALDIM" BELİRSİZLİĞİ — parser'ın en kritik kuralı.
 *
 * Türkçede "aldım" iki zıt anlama gelir:
 *   satın almak (GİDER) : "200 tl yemek aldım"
 *   edinmek/almak (GELİR): "maaşımı aldım", "paramı aldım"
 *
 * Ayrım NESNEDEN yapılır. Aşağıdaki kelimeler "aldım"ın nesnesiyse
 * cümle GELİRDİR; bunlar para akışının kendisini adlandırır, satın
 * alınan bir mal değildir.
 */
export const INCOME_OBJECTS: readonly string[] = [
  "maas", "maasi", "maasimi", "maasim",
  "para", "parayi", "param", "parami",
  "odeme", "odemeyi", "odememi",
  "ucret", "ucreti", "ucretimi",
  "prim", "primi", "primimi",
  "ikramiye", "ikramiyeyi", "ikramiyemi",
  "bonus", "bonusu",
  "alacagi", "alacagimi", "alacak",
  "borcu", "borcumu",
  "harclik", "harcligi", "harcligimi",
  "emekli", "emekli maasi",
  "kira geliri", "faiz", "faizi",
  "temettu", "temettuyu",
  "iade", "iadeyi",
  "avans", "avansi", "avansimi",
];

/**
 * Transfer sinyalleri. Kendi hesapları arası para taşıma.
 *
 * Ayrı tutulur çünkü ne gelir ne giderdir; raporlarda iki kez
 * sayılmaması buna bağlı.
 */
export const TRANSFER_SIGNALS: readonly string[] = [
  "transfer", "aktardim", "aktardik", "aktarma",
  "havale", "eft",
  "cektim atm", "atm den cektim", "nakit cektim",
  "hesaptan hesaba", "kendi hesabima",
  "karttan nakite", "bankadan cektim",
];

/** Bir metin sözlükteki herhangi bir öneki içeriyor mu. */
export function matchesAny(
  normalizedText: string,
  lexicon: readonly string[],
): string | null {
  for (const entry of lexicon) {
    if (normalizedText.includes(entry)) return entry;
  }
  return null;
}
