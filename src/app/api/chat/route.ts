import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatAttempts, runAssistant } from "@/features/assistant/chain";
import { runReadTool, capReadData, type ReadToolData } from "@/features/assistant/read-tools";
import { RateLimiter } from "@/features/assistant/ratelimit";
import type { AssistantContext } from "@/features/assistant/prompt";

/**
 * Modül düzeyinde: sayaç istekler arasında yaşamalı.
 *
 * Route handler gövdesinde kurulsaydı her istek kendi boş
 * sayacını alır ve sınır hiçbir şey yapmazdı.
 */
const limiter = new RateLimiter();

/**
 * Asistan uç noktası.
 *
 * ── NEDEN SUNUCUDA ──
 *
 * `GEMINI_API_KEY` burada kalır. İstemciden çağrılsa anahtar
 * tarayıcıya inmek zorunda kalırdı ve herkese açık olurdu.
 *
 * ── BU UÇ NOKTA HİÇBİR ŞEY YAZMAZ ──
 *
 * Yalnızca niyet üretir. Yazma işini istemci, mevcut mutation
 * hook'ları üzerinden ve kullanıcının kendi RLS kapsamında yapar.
 * `service_role` anahtarı bu dosyaya ASLA girmez.
 *
 * ── OTURUM ZORUNLU ──
 *
 * Girişsiz istek reddedilir. Aksi halde uç nokta herkese açık bir
 * Gemini vekili olur ve kota tanımadığımız kişilerce tüketilir.
 */

/** İstek gövdesi: mesaj + istemcinin derlediği asgari bağlam. */
interface ChatRequestBody {
  message?: unknown;
  context?: unknown;
  /**
   * Okuma araçlarının üzerinde çalışacağı veri.
   *
   * ── NEDEN İSTEMCİDEN GELİYOR ──
   *
   * Sunucu kullanıcının verisini GÖRMÜYOR: RLS kullanıcının kendi
   * oturumuna bağlı ve bu uç nokta `service_role` kullanmıyor.
   * Veriyi sunucuda yeniden çekmek ya ikinci bir Supabase turu ya
   * da RLS'i baypas eden bir anahtar gerektirirdi — ikincisi bu
   * mimarinin tam reddettiği şey.
   *
   * İstemci zaten TanStack Query önbelleğinde tutuyor; özeti o
   * veriden kurup gönderiyor. Gelen veri GÜVENİLMEZ sayılıyor ama
   * zararı da yok: yalnızca Gemini'ye gönderilecek bir özet
   * üretiyor, hiçbir yere yazılmıyor.
   */
  readData?: unknown;
}

const MAX_MESSAGE_LENGTH = 1000;

/**
 * Sunucuda bugünün tarihi — İstanbul saatiyle.
 *
 * Sunucu UTC'de çalışıyor olabilir; `toISOString()` ile tarih almak
 * gece 00:00–03:00 arası ÖNCEKİ günü verir. `en-CA` yerel ayarı
 * 'YYYY-MM-DD' üretir.
 */
function todayInIstanbul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

/**
 * İstemciden gelen bağlamı temizler.
 *
 * İstemci gövdesi de güvenilmez: yalnızca beklediğimiz alanlar,
 * beklediğimiz biçimde geçer. Kimlik alanı hiç okunmaz — Gemini'ye
 * yalnızca adlar gider.
 */
function normalizeContext(raw: unknown): AssistantContext {
  const empty: AssistantContext = {
    today: todayInIstanbul(),
    categories: [],
    accounts: [],
  };
  if (typeof raw !== "object" || raw === null) return empty;

  const obj = raw as Record<string, unknown>;

  const categories = Array.isArray(obj.categories)
    ? obj.categories
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .filter(
          (c) => typeof c.name === "string" && (c.kind === "income" || c.kind === "expense"),
        )
        .map((c) => ({ name: c.name as string, kind: c.kind as "income" | "expense" }))
    : [];

  const accounts = Array.isArray(obj.accounts)
    ? obj.accounts
        .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
        .filter(
          (a) =>
            typeof a.name === "string" &&
            (a.kind === "cash" || a.kind === "bank" || a.kind === "credit_card"),
        )
        .map((a) => ({
          name: a.name as string,
          kind: a.kind as "cash" | "bank" | "credit_card",
        }))
    : [];

  const today =
    typeof obj.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.today)
      ? obj.today
      : todayInIstanbul();

  return { today, categories, accounts };
}

/**
 * İstemciden gelen okuma verisini temizler.
 *
 * Beklenmeyen alanlar atılıyor. Veri yalnızca özet üretmek için
 * kullanılıyor ve hiçbir yere yazılmıyor, ama biçimi bozuksa
 * `runReadTool` çalışma zamanında patlardı.
 */
function normalizeReadData(raw: unknown): ReadToolData {
  const empty: ReadToolData = { accounts: [], transactions: [], budgets: [], debts: [] };
  if (typeof raw !== "object" || raw === null) return empty;
  const o = raw as Record<string, unknown>;

  const arr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v)
      ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      : [];

  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");

  return {
    accounts: arr(o.accounts).map((a) => ({
      name: str(a.name),
      kind: (a.kind === "bank" || a.kind === "credit_card" ? a.kind : "cash") as
        | "cash"
        | "bank"
        | "credit_card",
      balanceKurus: num(a.balanceKurus) as ReadToolData["accounts"][number]["balanceKurus"],
    })),
    transactions: arr(o.transactions).map((t) => ({
      kind: (t.kind === "income" || t.kind === "transfer" ? t.kind : "expense") as
        | "income"
        | "expense"
        | "transfer",
      amountKurus: num(t.amountKurus) as ReadToolData["transactions"][number]["amountKurus"],
      date: str(t.date) as ReadToolData["transactions"][number]["date"],
      categoryName: typeof t.categoryName === "string" ? t.categoryName : null,
      note: typeof t.note === "string" ? t.note : null,
    })),
    budgets: arr(o.budgets).map((b) => ({
      categoryName: str(b.categoryName),
      limitKurus: num(b.limitKurus) as ReadToolData["budgets"][number]["limitKurus"],
      spentKurus: num(b.spentKurus) as ReadToolData["budgets"][number]["spentKurus"],
    })),
    debts: arr(o.debts).map((d) => ({
      counterparty: str(d.counterparty),
      direction: (d.direction === "receivable" ? "receivable" : "payable") as
        | "payable"
        | "receivable",
      principalKurus: num(d.principalKurus) as ReadToolData["debts"][number]["principalKurus"],
      remainingKurus: num(d.remainingKurus) as ReadToolData["debts"][number]["remainingKurus"],
    })),
  };
}

export async function POST(request: NextRequest) {
  /*
   * ── SIRA ÖNEMLİ: ÖNCE OTURUM ──
   *
   * Yapılandırma kontrolü (anahtar var mı) önce yapılsaydı,
   * oturumsuz bir çağrı 503 ile "sunucuda anahtar tanımlı değil"
   * bilgisini öğrenirdi. Tek bit'lik bir sızıntı ama bedava
   * önlenebiliyor: kimliği doğrulanmamış çağrı sunucu
   * yapılandırması hakkında hiçbir şey öğrenmemeli.
   */
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  /*
   * ── HIZ SINIRI ──
   *
   * Model zinciri tek istekte 5 modele kadar deneme yapıyor, yani
   * her çağrı yukarı akışta 5 çağrıya kadar çıkabilir. Anahtar tek
   * ve paylaşılmış: döngüye giren bir istemci günlük kotayı HERKES
   * için tüketir. Sınır bu etkiyi kullanıcının kendi payına hapsediyor.
   */
  const rl = limiter.check(userId);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Çok hızlı gidiyorsun, biraz bekleyip tekrar dener misin?" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Yapay zeka yapılandırılmamış. İşlemi elle ekleyebilirsin." },
      { status: 503 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "İstek okunamadı." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Mesaj boş." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: "Mesaj çok uzun, biraz kısaltır mısın?" },
      { status: 400 },
    );
  }

  const ctx = normalizeContext(body.context);

  // Biçim temizliği + boyut tavanı: elle kurulmuş dev bir gövde
  // sunucuyu boşa çalıştırmasın.
  const readData = capReadData(normalizeReadData(body.readData));

  const result = await runAssistant({
    apiKey,
    message,
    ctx,
    // Okuma aracı sunucuda çalışıyor ama veri istemciden geldi:
    // RLS baypas edilmiyor, `service_role` devreye girmiyor.
    runRead: (name, args) => runReadTool(name, args, readData),
  });

  /*
   * ── TEŞHİS BAŞLIKLARI ──
   *
   * Hangi modelin cevap verdiği ve öncekilerin neden düştüğü
   * arayüzde görünmüyor. Gövdeye koymak istemci sözleşmesini
   * değiştirirdi; başlıkta taşınınca tarayıcının Ağ sekmesinden
   * okunuyor, arayüz etkilenmiyor. Yalnızca oturumlu çağrı görür.
   */
  const headers: Record<string, string> = {
    "x-assistant-attempts": formatAttempts(result.attempts),
  };

  if (result.kind === "error") {
    return NextResponse.json({ error: result.error }, { status: 502, headers });
  }
  headers["x-assistant-model"] = result.model;
  if (result.kind === "message") {
    return NextResponse.json({ text: result.text }, { headers });
  }
  return NextResponse.json({ intents: result.intents, skipped: result.skipped }, { headers });
}
