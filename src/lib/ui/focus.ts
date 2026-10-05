/**
 * Odak tuzağı mantığı.
 *
 * ── NEDEN AYRI BİR DOSYA ──
 *
 * `aria-modal="true"` taşıyan bir diyalog, ekran okuyucuya
 * "arkamdaki her şey yok" der. Klavye bunu KENDİLİĞİNDEN yapmaz:
 * Tab tuşu diyaloğun son alanından sonra sayfanın arkasındaki
 * bağlantılara kayar. Ekran okuyucu kullanıcısı için içerik
 * görünmezken odak orada olur — çıkışsız bir durum.
 *
 * Karar mantığı buraya, DOM'a dokunmadan çıkarıldı: testler
 * `node` ortamında koşuyor (bkz. vitest.config.mts) ve tek bir
 * davranış için jsdom kurmak tüm takımı yavaşlatırdı. Gerçek
 * `focus()` çağrısını `Sheet` bileşeni yapıyor.
 */

/**
 * Tab sırasına giren öğeler.
 *
 * `:not([disabled])` şart: kaydetme sırasında butonlar
 * `loading` ile devre dışı kalıyor ve Tab orada takılmamalı.
 * `tabindex="-1"` de dışarıda — o, programatik odak içindir
 * (diyaloğun kendisi böyle odaklanıyor), Tab sırası için değil.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]",
]
  .map((s) => `${s}:not([disabled]):not([tabindex="-1"])`)
  .join(", ");

/**
 * Tab / Shift+Tab sonrası odaklanacak öğenin indeksi.
 *
 * @param current Şu an odakta olan öğenin indeksi; diyaloğun
 *                dışındaysa veya öğe listede yoksa -1.
 * @param count   Odaklanabilir öğe sayısı.
 * @param back    Shift+Tab ise true.
 * @returns       Odaklanacak indeks, ya da odaklanabilir hiçbir
 *                öğe yoksa `null` — çağıran taraf o durumda olayı
 *                EZMEMELİ, yoksa klavye tamamen kilitlenir.
 */
export function nextTrapFocus(
  current: number,
  count: number,
  back: boolean,
): number | null {
  if (count <= 0) return null;

  // Odak diyaloğun dışındaysa içeri al: ileri giderken ilk öğe,
  // geri giderken son öğe.
  if (current < 0) return back ? count - 1 : 0;

  // Modulo ile sarma: son öğeden Tab başa, ilk öğeden Shift+Tab sona.
  return (current + (back ? -1 : 1) + count) % count;
}
