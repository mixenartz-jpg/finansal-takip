/**
 * Para birimi: KURUS (TRY'nin 1/100'u), tam sayi.
 *
 * ── NEDEN FLOAT DEGIL ──
 *
 * `0.1 + 0.2 !== 0.3` JavaScript'te dogrudur. Bir butce uygulamasinda
 * bu, ay sonunda "1 kurus acik" gostermek demektir ve kullanici bunu
 * gordugu anda uygulamanin TUM rakamlarina guvenmeyi birakir. Hatanin
 * buyuklugu onemsiz, guven kaybi onarilamaz.
 *
 * ── NEDEN MARKALI TIP ──
 *
 * Duz `number` olsaydi, bir yerde lira bir yerde kurus tasiyan iki sayi
 * tip sistemi tarafindan ayirt edilemezdi. `toplam + fiyat` yazan kod
 * derlenirdi ve 100x hata sessizce gecerdi. Marka, bu iki sayiyi
 * derleme zamaninda uyumsuz kilar.
 *
 * Ayni doktrin tarihte de var: `DateStr` (src/lib/date/types.ts).
 */
export type Kurus = number & { readonly __brand: "Kurus" };

export const KURUS_PER_LIRA = 100;

/**
 * Guvenli ust sinir. Number.MAX_SAFE_INTEGER kurus cinsinden
 * ~90 trilyon TL eder -- bir bireyin hesabi icin sonsuz.
 *
 * Postgres tarafinda sutun `bigint`; supabase-js bunu JS `number`
 * olarak dondurur ve bu aralikta kayipsizdir.
 */
export const MAX_KURUS = Number.MAX_SAFE_INTEGER;
