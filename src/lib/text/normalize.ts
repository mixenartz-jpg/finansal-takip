/**
 * Türkçe duyarsız karşılaştırma için normalleştirme.
 *
 * `toLowerCase()` TEK BAŞINA YETMEZ. Türkçede "İ" küçük harfe
 * çevrildiğinde noktalı "i̇" (i + birleşen nokta) üretir ve bu, düz
 * "i" ile eşleşmez — "İstanbul" araması "istanbul" metnini bulamaz.
 * Aynı sorun "I" → "ı" yönünde de vardır.
 *
 * Çözüm: önce Türkçeye özgü harfleri elle eşle, sonra küçült, sonra
 * aksanları ayrıştırıp at. Böylece "sut" araması "süt"ü de bulur —
 * kullanıcı arama kutusuna aksan yazmak zorunda kalmaz.
 *
 * Defter aramasında ve yanlış çetelesinde ders/konu eşleştirmesinde
 * ortak kullanılır: "matematik", "Matematik" ve "MATEMATİK" çetelede
 * tek satır olmalıdır.
 */
export function normalize(text: string): string {
  return text
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    // Birleşen aksan işaretleri (U+0300–U+036F). Kaçış dizisi olarak
    // yazılır: dosyada çıplak birleşen karakter bırakmak, editörden
    // editöre taşınırken sessizce bozulabilir.
    .replace(/[\u0300-\u036f]/g, "");
}
