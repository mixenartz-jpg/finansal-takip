import { describe, expect, test, vi } from "vitest";
import { runAssistant } from "./chain";
import { MODEL_CHAIN } from "./models";

const ctx = {
  today: "2026-09-21",
  categories: [{ name: "Market", kind: "expense" as const }],
  accounts: [{ name: "Nakit", kind: "cash" as const }],
};

const fcBody = {
  id: "v1",
  status: "requires_action",
  steps: [
    {
      type: "function_call",
      id: "c1",
      name: "createTransaction",
      arguments: { kind: "expense", amountKurus: 30000, date: "2026-09-21" },
    },
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Sırayla verilen cevapları döndüren sahte fetch. */
function sequence(...responses: Response[]) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i] ?? responses[responses.length - 1];
    i++;
    // Response gövdesi tek kullanımlık: her çağrıda klon ver.
    return r.clone();
  });
}

/** İstek gövdesinden model adını söker. */
function modelsUsed(f: ReturnType<typeof vi.fn>): string[] {
  return f.mock.calls.map((c) => JSON.parse(String(c[1]!.body)).model);
}

describe("runAssistant -- mutlu yol", () => {
  test("ilk model başarılıysa zincir ilerlemez", async () => {
    const f = sequence(json(fcBody));
    const r = await runAssistant({ apiKey: "k", message: "markete 300", ctx, fetchFn: f });

    expect(r.kind).toBe("intent");
    if (r.kind !== "intent") return;
    expect(r.intent.name).toBe("createTransaction");
    expect(r.intent.needsConfirm).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(modelsUsed(f)).toEqual([MODEL_CHAIN[0]]);
  });

  test("model soru sorarsa metin döner", async () => {
    const f = sequence(
      json({
        id: "v1",
        status: "completed",
        steps: [{ type: "message", content: [{ type: "text", text: "Hangi hesaptan?" }] }],
      }),
    );
    const r = await runAssistant({ apiKey: "k", message: "300 attım", ctx, fetchFn: f });

    expect(r.kind).toBe("message");
    if (r.kind !== "message") return;
    expect(r.text).toBe("Hangi hesaptan?");
  });
});

describe("runAssistant -- ★ zincir düşmesi", () => {
  test("429'da sıradaki modele düşer", async () => {
    const f = sequence(json({ error: "quota" }, 429), json(fcBody));
    const r = await runAssistant({ apiKey: "k", message: "markete 300", ctx, fetchFn: f });

    expect(r.kind).toBe("intent");
    expect(f).toHaveBeenCalledTimes(2);
    expect(modelsUsed(f)).toEqual([MODEL_CHAIN[0], MODEL_CHAIN[1]]);
  });

  test("503'te de düşer", async () => {
    const f = sequence(json({}, 503), json(fcBody));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });
    expect(r.kind).toBe("intent");
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("ağ kopması da düşürür", async () => {
    let i = 0;
    const f = vi.fn(async () => {
      if (i++ === 0) throw new TypeError("Failed to fetch");
      return json(fcBody);
    });
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });
    expect(r.kind).toBe("intent");
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("tüm modeller 429 ise kota hatası döner", async () => {
    const f = sequence(json({}, 429));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(f).toHaveBeenCalledTimes(MODEL_CHAIN.length);
    expect(r.error).toMatch(/kota|yoğun|sonra/i);
  });

  /**
   * ── KALICI HATA ZİNCİRİ İLERLETMEZ ──
   *
   * Geçersiz anahtar her modelde aynı. Beş kez denemek kullanıcıyı
   * beş kat bekletir ve gerçek sebebi son modelin hatası arkasına
   * saklar.
   */
  test("★ 403'te zincir İLERLEMEZ, tek çağrı yapılır", async () => {
    const f = sequence(json({ error: "invalid key" }, 403));
    const r = await runAssistant({ apiKey: "bozuk", message: "x", ctx, fetchFn: f });

    expect(r.kind).toBe("error");
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("400'de de zincir ilerlemez", async () => {
    const f = sequence(json({}, 400));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });
    expect(r.kind).toBe("error");
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("runAssistant -- ★ bozuk niyet reddedilir", () => {
  test("tanımsız araç adı hata döner, niyet DÖNMEZ", async () => {
    const f = sequence(
      json({
        id: "v1",
        status: "requires_action",
        steps: [{ type: "function_call", id: "c", name: "dropTables", arguments: {} }],
      }),
    );
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.error).toMatch(/tanımadım|anlayamadım/i);
  });

  /**
   * Doğrulama hatası KOTA hatası değildir: model çalıştı, çıktısı
   * bozuk. Zinciri ilerletmek aynı bozuk çıktıyı beş kez üretme
   * ihtimali demek — ve beş kotayı boşa harcamak.
   */
  test("doğrulama hatası zinciri ilerletmez", async () => {
    const f = sequence(
      json({
        id: "v1",
        status: "requires_action",
        steps: [
          {
            type: "function_call",
            id: "c",
            name: "createTransaction",
            arguments: { kind: "expense", amountKurus: 12.5, date: "2026-09-21" },
          },
        ],
      }),
    );
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    expect(r.kind).toBe("error");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
