/**
 * Veritabanı hatalarının kullanıcıya gösterilecek biçime çevrilmesi.
 *
 * ── NEDEN HAM MESAJ GÖSTERİLMEZ ──
 *
 * Postgres hataları tablo, sütun, kısıt ve indeks adlarını içerir:
 *   `new row for relation "transactions" violates check constraint
 *    "transactions_amount_kurus_check"`
 *
 * Bu metin kullanıcıya iki şekilde zarar verir:
 *   (a) Hiçbir şey anlatmaz — kullanıcı ne yapacağını bilmez.
 *   (b) Şemanın iç yapısını dışarı sızdırır.
 *
 * Bu modül TANIDIĞI hataları eyleme dönük Türkçe mesaja çevirir;
 * tanımadıklarında genel bir mesaj döndürür ve ayrıntıyı yalnızca
 * geliştirici konsoluna yazar.
 */

/** Kullanıcıya gösterilen genel mesaj — hiçbir iç ayrıntı taşımaz. */
const GENERIC = "İşlem tamamlanamadı. Lütfen tekrar deneyin.";

/**
 * Tanınan kısıt ihlalleri.
 *
 * Anahtar: Postgres mesajında aranan parça (kısıt adı ya da trigger'ın
 * kendi Türkçe mesajı). Değer: kullanıcıya gösterilecek metin.
 *
 * Buradaki her satırın karşılığı `supabase/migrations/` içinde bir
 * kısıttır; kısıt yeniden adlandırılırsa bu liste de güncellenmeli.
 */
const KNOWN_CONSTRAINTS: readonly [string, string][] = [
  ["transfer_shape", "Transfer için hedef hesap seçilmeli ve kategori boş olmalı."],
  ["amount_kurus", "Tutar sıfırdan büyük olmalı."],
  ["Kategori türü", "Seçilen kategori işlem türüyle uyuşmuyor."],
  ["same_owner", "Seçilen hesap veya kategori bulunamadı."],
  ["duplicate key", "Bu isimde bir kayıt zaten var."],
  ["credit_limit_only_on_card", "Kredi limiti yalnızca kredi kartı hesabında olur."],
  ["categories_user_id_kind_name_key", "Bu isimde bir kategori zaten var."],
  ["accounts_name_check", "Hesap adı geçersiz."],
  ["note_check", "Açıklama çok uzun."],
];

/**
 * Ağ / oturum kaynaklı hatalar. Kısıt ihlali değiller ve kullanıcının
 * yapabileceği şey farklı: tekrar denemek ya da yeniden giriş yapmak.
 */
const KNOWN_TRANSPORT: readonly [string, string][] = [
  ["JWT", "Oturumunuz sona ermiş. Sayfayı yenileyip tekrar giriş yapın."],
  ["Failed to fetch", "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin."],
  ["NetworkError", "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin."],
  ["row-level security", "Bu kayda erişim izniniz yok."],
];

export interface DbErrorLike {
  message: string;
  code?: string;
}

/**
 * Hatayı kullanıcıya gösterilecek metne çevirir.
 *
 * @param error   Supabase/Postgres hatası
 * @param context Başarısız olan işin adı ("İşlem kaydedilemedi").
 *                Tanınan hatalarda kullanılmaz — o mesajlar kendi
 *                bağlamını zaten taşır.
 */
export function toUserMessage(error: DbErrorLike, context?: string): string {
  const raw = error.message ?? "";

  for (const [needle, message] of KNOWN_CONSTRAINTS) {
    if (raw.includes(needle)) return message;
  }
  for (const [needle, message] of KNOWN_TRANSPORT) {
    if (raw.includes(needle)) return message;
  }

  // Tanınmayan hata: ayrıntı KULLANICIYA GİTMEZ, konsola gider.
  logDbError(raw, context);
  return context ? `${context}. Lütfen tekrar deneyin.` : GENERIC;
}

/**
 * Tanınmayan hatayı geliştirici konsoluna yazar.
 *
 * Üretimde sessizdir: kullanıcının konsolunda şema adları görünmesin.
 * Gerçek bir hata toplama servisi (Sentry vb.) eklendiğinde bu
 * fonksiyonun içi değişir, çağrı noktaları değişmez.
 */
function logDbError(raw: string, context?: string): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.error(`[db] ${context ?? "hata"}: ${raw}`);
}

/** Hatayı kullanıcıya gösterilebilir bir `Error` nesnesine çevirir. */
export function toUserError(error: DbErrorLike, context?: string): Error {
  return new Error(toUserMessage(error, context));
}
