import { describe, expect, test, vi } from "vitest";
import { callGemini, GEMINI_ENDPOINT } from "./gemini";

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

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(
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
      fetchFn: vi.fn(async () => {
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
      fetchFn: vi.fn(async () => new Response("<html>502</html>", { status: 200 })),
    });
    expect(r.ok).toBe(false);
  });
});
