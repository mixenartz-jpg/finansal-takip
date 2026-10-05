import { MODEL_CHAIN, shouldFallback } from "./models";
import { callGemini } from "./gemini";
import { parseIntent, type Intent } from "./intent";
import type { AssistantContext } from "./prompt";

/**
 * Model zinciri yürütücüsü.
 *
 * Kota tükenen modelden sıradakine düşer. Kalıcı hatalarda
 * (geçersiz anahtar, bozuk istek) zinciri İLERLETMEZ — aynı hata
 * her modelde tekrarlanır.
 *
 * Doğrulama hatası da zinciri ilerletmez: model çalıştı, çıktısı
 * bozuk. Tekrar denemek aynı bozuk çıktıyı üretip beş kotayı
 * harcamakla sonuçlanır.
 */

export type AssistantResult =
  | { kind: "intent"; intent: Intent; model: string }
  | { kind: "message"; text: string; model: string }
  | { kind: "error"; error: string };

export interface RunAssistantOptions {
  apiKey: string;
  message: string;
  ctx: AssistantContext;
  fetchFn?: typeof fetch;
}

/** HTTP durumunu kullanıcıya gösterilecek Türkçe mesaja çevirir. */
function errorFor(status: number): string {
  if (status === 429) {
    return "Yapay zeka şu an çok yoğun, biraz sonra tekrar dener misin? İşlemi elle de ekleyebilirsin.";
  }
  if (status === 401 || status === 403) {
    return "Yapay zeka bağlantısı yapılandırılmamış. İşlemi elle ekleyebilirsin.";
  }
  if (status >= 500) {
    return "Yapay zeka şu an cevap vermiyor, biraz sonra tekrar dener misin?";
  }
  return "Yapay zekaya ulaşamadım. İşlemi elle ekleyebilirsin.";
}

export async function runAssistant(opts: RunAssistantOptions): Promise<AssistantResult> {
  const { apiKey, message, ctx, fetchFn } = opts;
  let lastStatus = 0;

  for (const model of MODEL_CHAIN) {
    const res = await callGemini({ apiKey, model, message, ctx, fetchFn });

    if (!res.ok) {
      lastStatus = res.status;
      // Kalıcı hata: sıradaki modelde de aynı olacak.
      if (!shouldFallback(res.status)) break;
      continue;
    }

    if (res.call) {
      const parsed = parseIntent(res.call);
      // Doğrulama hatası zinciri İLERLETMEZ.
      if (!parsed.valid) return { kind: "error", error: parsed.error };
      return { kind: "intent", intent: parsed.intent, model };
    }

    if (res.text) return { kind: "message", text: res.text, model };

    // Ne araç ne metin: model boş döndü. Sıradakini dene.
    lastStatus = 0;
  }

  return { kind: "error", error: errorFor(lastStatus) };
}
