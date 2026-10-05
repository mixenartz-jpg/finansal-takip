/**
 * Sistem yönergesi ve bağlam özeti.
 *
 * ── DIŞARI ÇIKAN VERİ ASGARİ ──
 *
 * Gemini'ye yalnızca kategori/hesap ADLARI ve bugünün tarihi gider.
 * Kimlikler gitmez: modelin onlara ihtiyacı yok, eşlemeyi istemci
 * yapıyor ve gereksiz kimlik sızdırmanın hiçbir karşılığı yok.
 * Ham işlem listesi de gitmez — hem token maliyeti hem gizlilik.
 */

export interface AssistantContext {
  /** Bugünün tarihi, 'YYYY-MM-DD'. Göreli tarihleri model buna göre çözer. */
  today: string;
  categories: readonly { name: string; kind: "income" | "expense" }[];
  accounts: readonly { name: string; kind: "cash" | "bank" | "credit_card" }[];
}

export const SYSTEM_INSTRUCTION = `Sen bir kişisel finans uygulamasının asistanısın. Kullanıcı Türkçe konuşur, sen de Türkçe cevap verirsin.

Görevin: kullanıcının ne yapmak istediğini anlayıp uygun aracı çağırmak.

Kurallar:
- Bir işi yapmak için ARAÇ ÇAĞIR. Yapacağını anlatıp geçme.
- ASLA uydurma. Kullanıcının kategorileri ve hesapları aşağıda listeli; listede olmayan bir ad kullanma. Hangisini kastettiğinden emin değilsen SOR.
- Göreli tarihleri ("dün", "geçen hafta", "bu ayın başı") aşağıda verilen bugünün tarihine göre hesapla.
- Tutarları KURUŞ cinsinden tam sayı olarak ver. 12,50 TL = 1250.
- Bir kaydı güncellemek veya silmek gerekiyorsa ÖNCE findTransactions ile hangi kayıt olduğunu bul.
- Çok sayıda kayıt eşleşiyorsa işlemi yapma; kullanıcıdan daraltmasını iste.
- Emin olmadığın hiçbir alanı doldurma; eksik bırak, kullanıcı onay ekranında tamamlar.`;

const ACCOUNT_LABELS: Record<AssistantContext["accounts"][number]["kind"], string> = {
  cash: "nakit",
  bank: "banka",
  credit_card: "kredi kartı",
};

export function buildContextBlock(ctx: AssistantContext): string {
  const cats = ctx.categories.length
    ? ctx.categories
        .map((c) => `- ${c.name} (${c.kind === "income" ? "gelir" : "gider"})`)
        .join("\n")
    : "- (kategori yok)";

  const accs = ctx.accounts.length
    ? ctx.accounts.map((a) => `- ${a.name} (${ACCOUNT_LABELS[a.kind]})`).join("\n")
    : "- (hesap yok)";

  return `Bugünün tarihi: ${ctx.today}

Kullanıcının kategorileri:
${cats}

Kullanıcının hesapları:
${accs}`;
}
