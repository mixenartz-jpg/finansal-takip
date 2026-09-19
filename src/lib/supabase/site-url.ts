/**
 * Uygulamanın kendi kök adresini döndürür.
 *
 * E-posta doğrulama bağlantısının nereye döneceğini belirlemek için gerekli.
 * Supabase'in "Site URL" ayarına güvenmek yerine adresi çalışma anında
 * türetiyoruz; böylece localhost, preview deploy ve canlı ortam aynı kodla
 * doğru çalışır.
 */
export function getSiteUrl(): string {
  // Tarayıcıda en güvenilir kaynak sayfanın kendi adresi: preview deploy'lar
  // dahil her ortamda doğru sonucu verir.
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  // Sunucuda: elle ayarlanan adres önce gelir (kendi domainin varsa bunu kullan).
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return stripTrailingSlash(withProtocol(configured));

  // Vercel her deploy'a bu değişkeni protokolsüz olarak enjekte eder.
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercel) return stripTrailingSlash(withProtocol(vercel));

  return "http://localhost:3000";
}

function withProtocol(url: string): string {
  return url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `https://${url}`;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
