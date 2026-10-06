import { NO_RESPONSE, TIMED_OUT } from "./models";
import { TOOLS } from "./tools";
import { SYSTEM_INSTRUCTION, buildContextBlock, type AssistantContext } from "./prompt";

/**
 * Gemini Interactions API istemcisi.
 *
 * ── BİÇİM 2026-09-21'DE DOĞRULANDI ──
 *
 * context7 MCP ile ai.google.dev/gemini-api dokümantasyonundan:
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   başlık: x-goog-api-key
 *   gövde:  { model, store, input: [{type:"user_input",...}], tools: [...] }
 *   cevap:  { id, status, steps: [{type:"function_call", id, name, arguments}] }
 *
 * Eski `models/<model>:generateContent` + `contents[].parts[]` deseni
 * DEĞİL. `arguments` alanı NESNE, JSON string değil.
 *
 * ── SDK NEDEN YOK ──
 *
 * Tek uç nokta, tek istek biçimi. `@google/genai` paketi bunun için
 * bir bağımlılık, bir sürüm riski ve sunucu paketinde fazladan yük
 * demek. `fetch` yeterli — ve enjekte edilebildiği için test
 * edilebilir.
 */

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** Modelin talep ettiği araç çağrısı. */
export interface GeminiFunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** Bir araç çağrısı ve sonucunun bağlanacağı kimlik. */
export interface GeminiCallStep {
  call: GeminiFunctionCall;
  callId: string | null;
}

export type GeminiCallResult =
  | {
      ok: true;
      /** İlk araç çağrısı; yoksa null. `calls[0].call` ile aynı. */
      call: GeminiFunctionCall | null;
      /**
       * Modelin istediği TÜM araç çağrıları, sırasıyla.
       *
       * Kullanıcı tek mesajda birden fazla işlem söylediğinde model
       * her biri için ayrı `function_call` adımı üretiyor. Yalnızca
       * ilkini almak diğer işlemleri sessizce düşürüyordu.
       */
      calls: readonly GeminiCallStep[];
      text: string | null;
      /**
       * Modelin ürettiği adımlar, DEĞİŞTİRİLMEDEN.
       *
       * İkinci tur (araç sonucunu geri gönderme) bunları olduğu
       * gibi geri istiyor: `thought` adımları `signature` taşıyor
       * ve o imzalar yeniden üretilemez.
       */
      steps: readonly unknown[];
      /** `function_call` adımının kimliği — sonuç buna bağlanır. */
      callId: string | null;
    }
  | { ok: false; status: number };

/** İkinci turda geri gönderilen araç sonucu. */
export interface GeminiFunctionResult {
  name: string;
  callId: string;
  /** Sonuç JSON'u — metin olarak. */
  text: string;
}

export interface CallGeminiOptions {
  apiKey: string;
  model: string;
  message: string;
  ctx: AssistantContext;
  /** Enjekte edilir: testler gerçek ağa çıkmaz. */
  fetchFn?: typeof fetch;
  /**
   * İlk turda dönen model adımları — ikinci turda BİREBİR geri
   * gönderilir. Durumsuz modda (store:false) Gemini 3.x bunu
   * zorunlu kılıyor: `thought` adımlarının imzaları olmadan
   * konuşma sürdürülemez.
   */
  priorSteps?: readonly unknown[];
  /** Çalıştırılan aracın sonucu. `priorSteps` ile birlikte verilir. */
  functionResult?: GeminiFunctionResult;
  /**
   * Bu kadar ms içinde cevap gelmezse istek iptal edilir ve
   * `TIMED_OUT` döner. Verilmezse sınır yok.
   */
  timeoutMs?: number;
}

interface InteractionStep {
  type?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
  content?: { type?: string; text?: string }[];
}

export async function callGemini(opts: CallGeminiOptions): Promise<GeminiCallResult> {
  const { apiKey, model, message, ctx, fetchFn = fetch, priorSteps, functionResult } = opts;
  const signal = opts.timeoutMs === undefined ? undefined : AbortSignal.timeout(opts.timeoutMs);
  // İptal sebebi yalnızca bizim sınırımız olabilir: başka sinyal yok.
  const failure = (): GeminiCallResult => ({
    ok: false,
    status: signal?.aborted ? TIMED_OUT : NO_RESPONSE,
  });

  const body = {
    model,
    // Durumsuz: sunucuda oturum tutmuyoruz, her istek kendi başına.
    store: false,
    system_instruction: `${SYSTEM_INSTRUCTION}\n\n${buildContextBlock(ctx)}`,
    /*
     * Durumsuz mod sırası: kullanıcı girdisi → model adımları →
     * araç sonucu. Adımlar atlanırsa ikinci tur reddedilir.
     */
    input: [
      { type: "user_input", content: message },
      ...(priorSteps ?? []),
      ...(functionResult
        ? [
            {
              type: "function_result",
              name: functionResult.name,
              call_id: functionResult.callId,
              result: [{ type: "text", text: functionResult.text }],
            },
          ]
        : []),
    ],
    tools: TOOLS,
  };

  let res: Response;
  try {
    res = await fetchFn(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        // Anahtar BAŞLIKTA: URL'e konsa sunucu loglarına ve
        // referer başlığına sızar.
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    // Ağ tamamen kopmuş ya da süre doldu.
    return failure();
  }

  if (!res.ok) return { ok: false, status: res.status };

  let json: { steps?: InteractionStep[] };
  try {
    json = (await res.json()) as { steps?: InteractionStep[] };
  } catch {
    // 200 ama JSON değil (proxy hata sayfası vb.) ya da gövde
    // okunurken süre doldu.
    return failure();
  }

  const steps = Array.isArray(json.steps) ? json.steps : [];

  const calls: GeminiCallStep[] = steps
    .filter((s) => s.type === "function_call" && typeof s.name === "string")
    .map((s) => ({
      call: {
        name: s.name as string,
        arguments:
          typeof s.arguments === "object" && s.arguments !== null && !Array.isArray(s.arguments)
            ? (s.arguments as Record<string, unknown>)
            : {},
      },
      callId: typeof s.id === "string" ? s.id : null,
    }));

  if (calls.length > 0) {
    return { ok: true, call: calls[0].call, calls, text: null, steps, callId: calls[0].callId };
  }

  // Araç çağrısı yok: model soru soruyor ya da bilgi veriyor.
  const text =
    steps
      .flatMap((s) => s.content ?? [])
      .map((c) => c.text)
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .join("\n") || null;

  return { ok: true, call: null, calls: [], text, steps, callId: null };
}
