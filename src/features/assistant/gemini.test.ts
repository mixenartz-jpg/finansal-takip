import { describe, expect, test, vi } from "vitest";
import { callGemini, GEMINI_ENDPOINT } from "./gemini";
import { NO_RESPONSE, TIMED_OUT } from "./models";

/**
 * Interactions API istemcisi.
 *
 * ── GERÇEK AĞ ÇAĞRISI YOK ──
 *
 * `fetch` enjekte ediliyor. Gerçek API'ye vuran test kotayı yer,
 * ağ olmadan kırmızı yanar ve Google'ın yavaş günü CI'ı düşürür.
 * Burada test edilen şey Gemini'nin zekâsı DEĞİL, bizim istek
 * şeklimiz ve cevap ayrıştırmamız.
 */

const ctx = {
  today: "2026-09-21",
  categories: [{ name: "Market", kind: "expense" as const }],
  accounts: [{ name: "Nakit", kind: "cash" as const }],
};

/** `requires_action` + function_call adımı taşıyan gerçekçi cevap. */
const fcResponse = {
  id: "v1_abc",
  status: "requires_action",
  model: "gemini-3.8-flash",
  steps: [
    {
      type: "function_call",
      id: "call_1",
      name: "createTransaction",
      arguments: { kind: "expense", amountKurus: 30000, date: "2026-09-21" },
    },
  ],
};

/**
 * Sahte `fetch`.
 *
 * İmza BİLEREK `typeof fetch` ile tiplendi: parametresiz
 * `vi.fn(async () => ...)` yazıldığında TypeScript argüman tipini
 * boş tuple olarak çıkarıyor ve `mock.calls[0][1]` derlenmiyor —
 * testler koşsa bile `tsc` kırmızı yanar.
 */
function fakeFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

describe("callGemini -- istek şekli", () => {
  test("doğru uç noktaya POST atar", async () => {
    const f = fakeFetch(fcResponse);
    await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "markete 300 attım",
      ctx,
      fetchFn: f,
    });

    const [url, init] = f.mock.calls[0];
    expect(url).toBe(GEMINI_ENDPOINT);
    expect(init!.method).toBe("POST");
  });

  /** Anahtar BAŞLIKTA gider; URL'e konursa log ve referer'a sızar. */
  test("★ anahtar x-goog-api-key başlığında, URL'de DEĞİL", async () => {
    const f = fakeFetch(fcResponse);
    await callGemini({
      apiKey: "gizli-anahtar",
      model: "gemini-3.8-flash",
      message: "selam",
      ctx,
      fetchFn: f,
    });

    const [url, init] = f.mock.calls[0];
    const headers = init!.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("gizli-anahtar");
    expect(String(url)).not.toContain("gizli-anahtar");
  });

  test("gövde Interactions API biçiminde", async () => {
    const f = fakeFetch(fcResponse);
    await callGemini({
      apiKey: "k",
      model: "gemini-3.7-flash",
      message: "markete 300 attım",
      ctx,
      fetchFn: f,
    });

    const body = JSON.parse(String(f.mock.calls[0][1]!.body));
    expect(body.model).toBe("gemini-3.7-flash");
    // Durumsuz: sunucuda oturum durumu tutmuyoruz.
    expect(body.store).toBe(false);
    // Araçlar DÜZ DİZİ — eski functionDeclarations sarmalayıcısı DEĞİL.
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools[0].type).toBe("function");
    expect(body.tools[0]).not.toHaveProperty("functionDeclarations");
    // Kullanıcı mesajı user_input adımı olarak gider.
    expect(body.input[0].type).toBe("user_input");
  });

  test("kullanıcı mesajı ve bağlam gövdede geçer", async () => {
    const f = fakeFetch(fcResponse);
    await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "markete 300 attım",
      ctx,
      fetchFn: f,
    });

    const raw = String(f.mock.calls[0][1]!.body);
    expect(raw).toContain("markete 300 attım");
    expect(raw).toContain("2026-09-21");
    expect(raw).toContain("Market");
  });
});

describe("callGemini -- cevap ayrıştırma", () => {
  test("function_call adımını çıkarır", async () => {
    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "x",
      ctx,
      fetchFn: fakeFetch(fcResponse),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.call).toEqual({
      name: "createTransaction",
      arguments: { kind: "expense", amountKurus: 30000, date: "2026-09-21" },
    });
  });

  /** Model araç çağırmayıp düz metin dönebilir: "hangi hesaptan?" */
  test("araç çağrısı yoksa metin döner", async () => {
    const textResponse = {
      id: "v1_x",
      status: "completed",
      model: "gemini-3.8-flash",
      steps: [{ type: "message", content: [{ type: "text", text: "Hangi hesaptan?" }] }],
    };

    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "300 attım",
      ctx,
      fetchFn: fakeFetch(textResponse),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.call).toBeNull();
    expect(r.text).toBe("Hangi hesaptan?");
  });

  test("boş steps çökmez", async () => {
    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "x",
      ctx,
      fetchFn: fakeFetch({ id: "v1", status: "completed", steps: [] }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.call).toBeNull();
  });

  test("HTTP hatası durum koduyla döner", async () => {
    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "x",
      ctx,
      fetchFn: fakeFetch({ error: { message: "quota" } }, 429),
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(429);
  });

  /** Ağ tamamen kopabilir; fetch fırlatır. Çağıran taraf çökmemeli. */
  test("fetch fırlatırsa status 0 ile döner", async () => {
    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "x",
      ctx,
      fetchFn: vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(0);
  });

  test("JSON olmayan cevap status 0 ile döner", async () => {
    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "x",
      ctx,
      fetchFn: vi.fn<typeof fetch>(
        async () => new Response("<html>502</html>", { status: 200 }),
      ),
    });
    expect(r.ok).toBe(false);
  });
});

describe("callGemini -- ★ ikinci tur (function_result)", () => {
  /**
   * ── MODEL ADIMLARI BİREBİR GERİ GÖNDERİLİR ──
   *
   * Durumsuz modda (store:false) Gemini 3.x, `thought` adımlarının
   * taşıdığı `signature` değerlerini SORUYOR. Adımlar atılırsa
   * ikinci tur reddedilir ya da model bağlamı kaybeder.
   *
   * Doküman (2026-10-05, context7): "you must preserve and resend
   * all model-generated steps (such as thought and function_call
   * steps) exactly as received, as they contain signatures
   * required to continue the conversation."
   */
  const firstTurnSteps = [
    { type: "thought", summary: [{ type: "text", text: "bakiyeye bakmalıyım" }], signature: "sig-abc" },
    { type: "function_call", id: "fc_1", name: "getBalances", arguments: {} },
  ];

  test("geçmiş adımlar ve function_result gövdeye girer", async () => {
    const f = fakeFetch({
      id: "v2",
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: "Kasada 500 TL var." }] }],
    });

    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "kasada ne kadar var",
      ctx,
      fetchFn: f,
      priorSteps: firstTurnSteps,
      functionResult: { name: "getBalances", callId: "fc_1", text: '{"nakit":50000}' },
    });

    const body = JSON.parse(String(f.mock.calls[0][1]!.body));

    // Kullanıcı girdisi + model adımları + sonuç, BU SIRADA.
    expect(body.input[0].type).toBe("user_input");
    expect(body.input[1]).toEqual(firstTurnSteps[0]);
    expect(body.input[2]).toEqual(firstTurnSteps[1]);
    expect(body.input[3]).toEqual({
      type: "function_result",
      name: "getBalances",
      call_id: "fc_1",
      result: [{ type: "text", text: '{"nakit":50000}' }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toBe("Kasada 500 TL var.");
  });

  /** `signature` alanı AYNEN korunmalı — yeniden üretilemez. */
  test("★ thought imzası değiştirilmeden taşınır", async () => {
    const f = fakeFetch({ id: "v2", status: "completed", steps: [] });
    await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "x",
      ctx,
      fetchFn: f,
      priorSteps: firstTurnSteps,
      functionResult: { name: "getBalances", callId: "fc_1", text: "{}" },
    });

    const raw = String(f.mock.calls[0][1]!.body);
    expect(raw).toContain("sig-abc");
  });

  /** İlk turda bu alanlar yok: gövde eskisi gibi kalmalı. */
  test("priorSteps yoksa gövde tek user_input taşır", async () => {
    const f = fakeFetch({ id: "v1", status: "completed", steps: [] });
    await callGemini({ apiKey: "k", model: "gemini-3.8-flash", message: "x", ctx, fetchFn: f });

    const body = JSON.parse(String(f.mock.calls[0][1]!.body));
    expect(body.input).toHaveLength(1);
    expect(body.input[0].type).toBe("user_input");
  });

  /** `model_output` adımından da metin okunabilmeli. */
  test("model_output metni okunur", async () => {
    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "x",
      ctx,
      fetchFn: fakeFetch({
        id: "v2",
        status: "completed",
        steps: [{ type: "model_output", content: [{ type: "text", text: "Bu ay 1.200 TL." }] }],
      }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toBe("Bu ay 1.200 TL.");
  });

  /** İlk turda dönen adımlar çağırana verilmeli: ikinci tur onları ister. */
  test("★ cevaptaki adımlar çağırana DÖNER", async () => {
    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "x",
      ctx,
      fetchFn: fakeFetch({ id: "v1", status: "requires_action", steps: firstTurnSteps }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps).toEqual(firstTurnSteps);
    expect(r.callId).toBe("fc_1");
  });
});

describe("callGemini -- zaman sınırı", () => {
  /** Yalnızca istek iptal edilince sonlanan, hiç cevap vermeyen fetch. */
  const hangingFetch = () =>
    vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );

  test("cevap vermeyen model sınır dolunca zaman aşımı olarak döner", async () => {
    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "x",
      ctx,
      fetchFn: hangingFetch(),
      timeoutMs: 20,
    });

    expect(r).toEqual({ ok: false, status: TIMED_OUT });
  });

  test("sınır içinde gelen cevap etkilenmez", async () => {
    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "x",
      ctx,
      fetchFn: fakeFetch(fcResponse),
      timeoutMs: 1000,
    });

    expect(r.ok).toBe(true);
  });

  test("ağ kopması zaman aşımı sayılmaz", async () => {
    const f = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    const r = await callGemini({
      apiKey: "k",
      model: "gemini-3.8-flash",
      message: "x",
      ctx,
      fetchFn: f,
      timeoutMs: 1000,
    });

    expect(r).toEqual({ ok: false, status: NO_RESPONSE });
  });
});
