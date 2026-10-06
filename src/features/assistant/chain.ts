import {
  ATTEMPT_TIMEOUT_MS,
  LAST_ATTEMPT_TIMEOUT_MS,
  MODEL_CHAIN,
  NO_RESPONSE,
  TIMED_OUT,
  shouldFallback,
} from "./models";
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

/**
 * Zincirde tek bir modelin denenmesi.
 *
 * `status`: HTTP durumu; 200 cevap verdi, 0 cevap hiç gelmedi,
 * -1 cevap geldi ama içi boştu.
 */
export interface ModelAttempt {
  model: string;
  status: number;
}

export type AssistantResult = (
  | { kind: "intent"; intent: Intent; model: string }
  | { kind: "message"; text: string; model: string }
  | { kind: "error"; error: string }
) & {
  /** Denenen modeller, deneme sırasıyla. Teşhis için. */
  attempts: readonly ModelAttempt[];
};

export interface RunAssistantOptions {
  apiKey: string;
  message: string;
  ctx: AssistantContext;
  fetchFn?: typeof fetch;
  /**
   * Okuma aracını çalıştıran geri çağrı.
   *
   * Veri istemcide (TanStack Query önbelleğinde) yaşıyor; sunucu
   * onu görmüyor. Bu yüzden okuma aracı ÇAĞIRAN tarafta
   * çalıştırılıyor ve sonucu buradan geri geliyor.
   *
   * Verilmezse okuma aracı da niyet olarak döner — çağıran taraf
   * ikinci turu desteklemiyordur.
   */
  runRead?: (name: string, args: Record<string, unknown>) => string | null;
  /** Model başına bekleme sınırları. Verilmezse `models.ts` değerleri. */
  timeouts?: { attemptMs: number; lastAttemptMs: number };
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

const OK = 200;

/**
 * Deneme kaydını tek satıra çevirir: "a=429, b=ok".
 *
 * Cevap başlığında taşınıyor; hangi modelin cevap verdiğini ve
 * öncekilerin neden düştüğünü tarayıcının Ağ sekmesinden okumak için.
 */
export function formatAttempts(attempts: readonly ModelAttempt[]): string {
  return attempts.map((a) => `${a.model}=${labelFor(a.status)}`).join(", ");
}

function labelFor(status: number): string {
  if (status === OK) return "ok";
  if (status === EMPTY_RESPONSE) return "bos";
  if (status === NO_RESPONSE) return "cevap-yok";
  if (status === TIMED_OUT) return "zaman-asimi";
  return String(status);
}

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
  if (status >= 500 || status === TIMED_OUT) {
    return "Yapay zeka şu an cevap vermiyor, biraz sonra tekrar dener misin?";
  }
  return "Yapay zekaya ulaşamadım. İşlemi elle ekleyebilirsin.";
}

export async function runAssistant(opts: RunAssistantOptions): Promise<AssistantResult> {
  const { apiKey, message, ctx, fetchFn, runRead } = opts;
  const timeouts = opts.timeouts ?? {
    attemptMs: ATTEMPT_TIMEOUT_MS,
    lastAttemptMs: LAST_ATTEMPT_TIMEOUT_MS,
  };
  const lastIndex = MODEL_CHAIN.length - 1;
  let lastStatus = 0;
  const attempts: ModelAttempt[] = [];

  for (const [index, model] of MODEL_CHAIN.entries()) {
    const timeoutMs = index === lastIndex ? timeouts.lastAttemptMs : timeouts.attemptMs;
    const res = await callGemini({ apiKey, model, message, ctx, fetchFn, timeoutMs });

    if (!res.ok) {
      lastStatus = res.status;
      attempts.push({ model, status: res.status });
      // Kalıcı hata: sıradaki modelde de aynı olacak.
      if (!shouldFallback(res.status)) break;
      continue;
    }

    if (res.call) {
      attempts.push({ model, status: OK });
      const parsed = parseIntent(res.call);
      // Doğrulama hatası zinciri İLERLETMEZ.
      if (!parsed.valid) return { kind: "error", error: parsed.error, attempts };

      /*
       * ── OKUMA ARACI: İKİNCİ TUR ──
       *
       * Okuma aracı onay İSTEMEZ (veriyi değiştirmiyor). Aracı
       * burada çalıştırıp sonucu Gemini'ye geri gönderiyoruz; o da
       * kullanıcıya düz bir cevap yazıyor.
       *
       * Yazma aracı bu yola GİRMEZ: niyet olarak dönüp onay
       * kartına gider. Aksi halde asistan sormadan veri
       * değiştirirdi.
       */
      if (!parsed.intent.needsConfirm && runRead && res.callId) {
        const readOut = runRead(parsed.intent.name, parsed.intent.args);
        if (readOut !== null) {
          const second = await callGemini({
            apiKey,
            model,
            message,
            ctx,
            fetchFn,
            // Kısa sınır, son modelde bile: bu tur başarısız olursa
            // aracın özeti zaten gösteriliyor, beklemeye değmez.
            timeoutMs: timeouts.attemptMs,
            // Adımlar BİREBİR geri gidiyor: `thought` imzaları şart.
            priorSteps: res.steps,
            functionResult: {
              name: parsed.intent.name,
              callId: res.callId,
              text: readOut,
            },
          });

          if (second.ok && second.text) {
            return { kind: "message", text: second.text, model, attempts };
          }
          // İkinci tur başarısız: en azından aracın özetini göster.
          return { kind: "message", text: readOut, model, attempts };
        }
      }

      return { kind: "intent", intent: parsed.intent, model, attempts };
    }

    if (res.text) {
      attempts.push({ model, status: OK });
      return { kind: "message", text: res.text, model, attempts };
    }

    // Ne araç ne metin: model boş döndü. Sıradakini dene, ama
    // sebebi "ulaşamadım" ile karıştırma.
    lastStatus = EMPTY_RESPONSE;
    attempts.push({ model, status: EMPTY_RESPONSE });
  }

  return { kind: "error", error: errorFor(lastStatus), attempts };
}
