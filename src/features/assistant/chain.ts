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

/**
 * "Model cevap verdi ama içi boştu" durumu.
 *
 * ── NEDEN AYRI BİR DEĞER ──
 *
 * Bu durum da `callGemini`'nin "cevap hiç gelmedi" değeri (0) ile
 * aynı kutuya konuyordu ve kullanıcı "Yapay zekaya ulaşamadım"
 * mesajını görüyordu. Oysa yapay zekaya BEŞ KEZ ulaşıldı; sorun
 * modelin kullanışlı bir şey üretmemesi.
 *
 * Yanlış mesaj, hatayı arayan kişiyi doğrudan ağ/bağlantı
 * teorisine yönlendirir — gerçek sebep ise istem veya ayrıştırma
 * tarafındadır. İki başarısızlık biçimi ayrı tutuluyor.
 */
const EMPTY_RESPONSE = -1;

/** HTTP durumunu kullanıcıya gösterilecek Türkçe mesaja çevirir. */
function errorFor(status: number): string {
  if (status === EMPTY_RESPONSE) {
    return "Bunu anlayamadım, başka şekilde anlatır mısın? İşlemi elle de ekleyebilirsin.";
  }
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

    // Ne araç ne metin: model boş döndü. Sıradakini dene, ama
    // sebebi "ulaşamadım" ile karıştırma.
    lastStatus = EMPTY_RESPONSE;
  }

  return { kind: "error", error: errorFor(lastStatus) };
}
