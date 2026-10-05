import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAssistant } from "@/features/assistant/chain";
import type { AssistantContext } from "@/features/assistant/prompt";

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

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Yapay zeka yapılandırılmamış. İşlemi elle ekleyebilirsin." },
      { status: 503 },
    );
  }

  // Oturum kontrolü — uç nokta açık bir Gemini vekiline dönüşmesin.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
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

  const result = await runAssistant({ apiKey, message, ctx });

  if (result.kind === "error") {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  if (result.kind === "message") {
    return NextResponse.json({ text: result.text });
  }
  return NextResponse.json({ intent: result.intent });
}
