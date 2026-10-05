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

export type GeminiCallResult =
  | { ok: true; call: GeminiFunctionCall | null; text: string | null }
  | { ok: false; status: number };

export interface CallGeminiOptions {
  apiKey: string;
  model: string;
  message: string;
  ctx: AssistantContext;
  /** Enjekte edilir: testler gerçek ağa çıkmaz. */
  fetchFn?: typeof fetch;
}

interface InteractionStep {
  type?: string;
  name?: string;
  arguments?: unknown;
  content?: { type?: string; text?: string }[];
}

export async function callGemini(opts: CallGeminiOptions): Promise<GeminiCallResult> {
  const { apiKey, model, message, ctx, fetchFn = fetch } = opts;

  const body = {
    model,
    // Durumsuz: sunucuda oturum tutmuyoruz, her istek kendi başına.
    store: false,
    system_instruction: `${SYSTEM_INSTRUCTION}\n\n${buildContextBlock(ctx)}`,
    input: [{ type: "user_input", content: message }],
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
    });
  } catch {
    // Ağ tamamen kopmuş. 0 "HTTP cevabı yok" anlamında.
    return { ok: false, status: 0 };
  }

  if (!res.ok) return { ok: false, status: res.status };

  let json: { steps?: InteractionStep[] };
  try {
    json = (await res.json()) as { steps?: InteractionStep[] };
  } catch {
    // 200 ama JSON değil (proxy hata sayfası vb.).
    return { ok: false, status: 0 };
  }

  const steps = Array.isArray(json.steps) ? json.steps : [];

  const fc = steps.find((s) => s.type === "function_call");
  if (fc && typeof fc.name === "string") {
    const args =
      typeof fc.arguments === "object" && fc.arguments !== null && !Array.isArray(fc.arguments)
        ? (fc.arguments as Record<string, unknown>)
        : {};
    return { ok: true, call: { name: fc.name, arguments: args }, text: null };
  }

  // Araç çağrısı yok: model soru soruyor ya da bilgi veriyor.
  const text =
    steps
      .flatMap((s) => s.content ?? [])
      .map((c) => c.text)
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .join("\n") || null;

  return { ok: true, call: null, text };
}
