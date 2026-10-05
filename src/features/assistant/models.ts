/**
 * Model zinciri.
 *
 * ── NEDEN ZİNCİR, TEK MODEL DEĞİL ──
 *
 * Ücretsiz katmanda her Flash modelinin GÜNLÜK istek kotası ayrıdır.
 * Tek modele bağlı kalmak günde ~5 istek demek — bir sohbet
 * asistanı için kullanılamaz. Kota tükendiğinde sıradakine düşmek
 * toplam kapasiteyi ~35'e çıkarır.
 *
 * Sıra zekâdan kotaya doğru: en iyi model önce denenir, en cömert
 * kotalı olan son çare.
 */
export const MODEL_CHAIN: readonly string[] = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

/**
 * `callGemini`'nin "HTTP cevabı hiç gelmedi" için kullandığı durum.
 *
 * Ağ koptuğunda, DNS çözülmediğinde ya da 200 dönen cevap JSON
 * olmadığında (proxy hata sayfası) gerçek bir durum kodu yoktur.
 */
export const NO_RESPONSE = 0;

/**
 * Bu HTTP durumu sıradaki modeli denemeyi haklı kılar mı?
 *
 * SADECE geçici hatalar:
 *   - 429: bu modelin kotası doldu, diğerinin kotası ayrı.
 *   - 5xx: Google tarafında geçici sorun.
 *   - 0  : cevap hiç gelmedi (ağ koptu, bozuk gövde). Geçici bir
 *          kesinti olabilir; ikinci bir deneme ucuz ve sık işe
 *          yarıyor. Bunu dışarıda bırakmak, tek bir ağ titremesinde
 *          zincirin ilk modelde durması demekti.
 *
 * Kalıcı hatalar zinciri İLERLETMEZ. Geçersiz anahtar (401/403) ya
 * da bozuk istek (400) her modelde aynı sonucu verir; beş kez
 * denemek yalnızca kullanıcıyı bekletir ve gerçek sebebi gizler.
 */
export function shouldFallback(status: number): boolean {
  return status === NO_RESPONSE || status === 429 || status >= 500;
}
