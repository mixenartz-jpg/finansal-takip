import { TOOLS, isToolName, isWriteTool, type ToolDefinition } from "./tools";

/**
 * Gemini'nin ürettiği niyetin DOĞRULANMASI.
 *
 * ── BU MODÜL BİR GÜVENLİK SINIRI ──
 *
 * Model çıktısı kullanıcı girdisi kadar güvenilmezdir. Buradan
 * geçmeyen hiçbir şey mutation hook'larına ulaşmaz. Reddetme
 * sebebi TÜRKÇE döner; kullanıcı "asistan çalışmıyor" değil
 * "bunu anlayamadım, şöyle söyle" görmeli.
 */

/**
 * Tek onayda işlenebilecek en fazla kayıt.
 *
 * Silme artık kimlik listesi değil tarif taşıyor; sınır onay
 * kartındaki seçicide (`targets.ts`) uygulanıyor. Dizi alanları
 * (anahtar kelimeler) da aynı tavanı paylaşıyor.
 */
export const MAX_BATCH = 20;

export interface Intent {
  name: string;
  args: Record<string, unknown>;
  /** Yazma aracıysa true — Faz 4 onay kartını buna göre gösterir. */
  needsConfirm: boolean;
}

export type IntentResult =
  | { valid: true; intent: Intent }
  | { valid: false; error: string };

const fail = (error: string): IntentResult => ({ valid: false, error });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' hem biçim hem GERÇEK tarih olmalı: 2026-13-45 geçmez. */
function isValidDate(v: unknown): boolean {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  // Ayın gün sayısı: 0. gün bir sonraki ayın "sıfırıncı" günü = son gün.
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Tarih olarak doğrulanan alan adları. `tools.test.ts` aynı listeyi kilitler. */
export const DATE_KEYS: readonly string[] = ["date", "from", "to", "dueDate", "matchFrom", "matchTo"];

/** Kuruş: pozitif TAM SAYI. Float para bu projede yasak. */
function isAmount(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/** Tam sayı, işaret serbest. */
function isSignedAmount(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v);
}

/**
 * Negatif olabilen kuruş alanları.
 *
 * Kural olarak her `*Kurus` alanı pozitif olmalı — bir işlem tutarı
 * sıfır ya da eksi olamaz. Tek istisna açılış bakiyesi: kredi
 * kartında NEGATİF başlar (borç) ve şemada da `> 0` kısıtı yoktur
 * (0001_schema.sql). Bu listede olmayan her `*Kurus` alanı pozitif
 * sayılır.
 */
const SIGNED_AMOUNT_KEYS: readonly string[] = ["openingKurus"];

/**
 * Aralığı sınırlı tam sayı alanları.
 *
 * Değerler `supabase/migrations/0007_recurring.sql` kısıtlarından
 * geliyor: `day_of between 1 and 31`, `month_of between 1 and 12`.
 *
 * ── NEDEN BURADA, FAZ 4'TE DEĞİL ──
 *
 * Bu modül "tek kapı" olduğunu iddia ediyor. Aralık kontrolünü
 * mutation hook'una bırakmak o iddiayı boşa çıkarır ve sınırı iki
 * yere dağıtır. Model "ayın 45'i" ürettiğinde kullanıcı bunu ham
 * bir Postgres kısıt hatası olarak değil, anlaşılır bir cümle
 * olarak görmeli.
 */
const INT_RANGES: Readonly<Record<string, { min: number; max: number; label: string }>> = {
  dayOf: { min: 1, max: 31, label: "Gün 1 ile 31 arasında olmalı." },
  monthOf: { min: 1, max: 12, label: "Ay 1 ile 12 arasında olmalı." },
};

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function toolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

/**
 * Tek bir argümanı şemasına göre doğrular.
 *
 * ── SIRA YÜKLEYİCİ ──
 *
 * Dallar alanın ADINA bakıyor ve sıra önemli: `*Kurus` kontrolü
 * `enum`'dan önce gelmeli, yoksa tutar alanı yanlış dalda
 * doğrulanır. Yeni bir araç alanı eklerken ad çarpışması olmadığını
 * `tools.test.ts` içindeki "checkArg dalıyla çarpışmasın" testleri
 * garanti ediyor — orayı kırmadan yeni ad ekleyemezsin.
 *
 * @returns Türkçe hata mesajı, ya da geçerliyse null.
 */
function checkArg(key: string, value: unknown, schema: Record<string, unknown>): string | null {
  const type = schema.type as string;

  if (key.endsWith("Kurus")) {
    if (SIGNED_AMOUNT_KEYS.includes(key)) {
      return isSignedAmount(value)
        ? null
        : "Açılış bakiyesini anlayamadım. Kuruş cinsinden tam bir sayı olmalı.";
    }
    return isAmount(value)
      ? null
      : "Tutarı anlayamadım. Kuruş cinsinden tam bir sayı olmalı.";
  }

  if (DATE_KEYS.includes(key)) {
    return isValidDate(value) ? null : `Tarihi anlayamadım: "${String(value)}".`;
  }

  if (key === "month") {
    return typeof value === "string" && MONTH_RE.test(value)
      ? null
      : "Ayı anlayamadım. 'YYYY-MM' biçiminde olmalı.";
  }

  if (Array.isArray(schema.enum)) {
    return (schema.enum as unknown[]).includes(value)
      ? null
      : `"${String(value)}" burada geçerli bir seçenek değil.`;
  }

  if (type === "array") {
    if (!Array.isArray(value)) return `${key} bir liste olmalı.`;
    if (value.length === 0) return "Liste boş geldi, ne yapacağımı anlayamadım.";
    if (value.length > MAX_BATCH) {
      return `${value.length} öğe çok fazla, en fazla ${MAX_BATCH} olabilir.`;
    }
    if (!value.every((x) => isNonEmptyString(x))) return `${key} yalnızca metin içermeli.`;
    return null;
  }

  if (type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return `${key} tam sayı olmalı.`;
    }
    const range = INT_RANGES[key];
    if (range && (value < range.min || value > range.max)) {
      return range.label;
    }
    return null;
  }

  if (type === "string") {
    return isNonEmptyString(value) ? null : `${key} boş geldi.`;
  }

  return null;
}

/**
 * Ham model çıktısını doğrulanmış niyete çevirir.
 *
 * Şemada olmayan alanlar SESSİZCE ATILIR: modelin uydurduğu bir
 * fazlalık yüzünden isteği reddetmek kullanıcıyı cezalandırırdı,
 * ama o alanı geçirmek de hook'a sızmasına yol açardı.
 */
export function parseIntent(raw: unknown): IntentResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return fail("Ne yapmak istediğini anlayamadım, tekrar söyler misin?");
  }

  const obj = raw as Record<string, unknown>;

  if (!isToolName(obj.name)) {
    return fail("Bu isteği tanımadım, başka şekilde anlatır mısın?");
  }
  const name = obj.name as string;

  const rawArgs = obj.arguments ?? {};
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return fail("İsteğin ayrıntılarını anlayamadım, tekrar söyler misin?");
  }

  const tool = toolByName(name);
  if (!tool) return fail("Bu isteği tanımadım, başka şekilde anlatır mısın?");

  const incoming = rawArgs as Record<string, unknown>;
  const args: Record<string, unknown> = {};

  // Yalnızca ŞEMADA TANIMLI alanlar geçer.
  for (const [key, schema] of Object.entries(tool.parameters.properties)) {
    if (!(key in incoming)) continue;
    const value = incoming[key];
    if (value === null || value === undefined) continue;

    const err = checkArg(key, value, schema as Record<string, unknown>);
    if (err) return fail(err);
    args[key] = value;
  }

  for (const req of tool.parameters.required ?? []) {
    if (!(req in args)) {
      return fail("İstekte eksik bilgi var, biraz daha ayrıntı verir misin?");
    }
  }

  return { valid: true, intent: { name, args, needsConfirm: isWriteTool(name) } };
}
