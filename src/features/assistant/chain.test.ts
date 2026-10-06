import { describe, expect, test, vi, type MockedFunction } from "vitest";
import { formatAttempts, runAssistant } from "./chain";
import { MODEL_CHAIN } from "./models";
import { MAX_BATCH } from "./intent";

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

/**
 * Sırayla verilen cevapları döndüren sahte fetch.
 *
 * `vi.fn<typeof fetch>`: parametresiz yazıldığında TypeScript
 * argüman tipini boş tuple çıkarıyor ve `mock.calls[i][1]`
 * derlenmiyor.
 */
function sequence(...responses: Response[]) {
  let i = 0;
  return vi.fn<typeof fetch>(async () => {
    const r = responses[i] ?? responses[responses.length - 1];
    i++;
    // Response gövdesi tek kullanımlık: her çağrıda klon ver.
    return r.clone();
  });
}

/** İstek gövdesinden model adını söker. */
function modelsUsed(f: MockedFunction<typeof fetch>): string[] {
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
    const f = vi.fn<typeof fetch>(async () => {
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

describe("runAssistant -- ★ model boş döndü", () => {
  /**
   * ── "ULAŞAMADIM" DEMEK YANLIŞTI ──
   *
   * Model başarıyla cevap verip ne araç çağrısı ne metin
   * döndürebilir (tanımadığımız bir adım türü, boş içerik).
   * Bu durumda zincir beş modeli de deniyor ve sonunda
   * "Yapay zekaya ulaşamadım" diyordu.
   *
   * Oysa yapay zekaya BEŞ KEZ ulaşıldı; sorun ağ değil, modelin
   * kullanışlı bir şey üretmemesi. Yanlış mesaj hatayı ararken
   * insanı doğrudan ağ/bağlantı teorisine yönlendirir.
   */
  test("hepsi boş dönerse mesaj ağ hatası İDDİA ETMEZ", async () => {
    const f = sequence(json({ id: "v1", status: "completed", steps: [] }));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    // Beş model de denendi.
    expect(f).toHaveBeenCalledTimes(MODEL_CHAIN.length);
    // Ulaşıldı: "ulaşamadım" demek yanlış olur.
    expect(r.error).not.toMatch(/ulaşamadım/i);
    // Kullanıcıya yine de bir çıkış yolu sunulmalı.
    expect(r.error).toMatch(/elle|tekrar/i);
  });
});

describe("runAssistant -- ★ okuma aracı ikinci tur", () => {
  const readFirstTurn = {
    id: "v1",
    status: "requires_action",
    steps: [
      { type: "thought", summary: [{ type: "text", text: "bakiyeye bakayım" }], signature: "sig-1" },
      { type: "function_call", id: "fc_1", name: "getBalances", arguments: {} },
    ],
  };

  /**
   * Okuma aracı ONAY İSTEMEZ: veriyi değiştirmiyor. Zincir aracı
   * kendisi çalıştırıp sonucu Gemini'ye geri göndermeli ve
   * kullanıcıya düz cevap dönmeli.
   */
  test("okuma aracı çalıştırılıp sonuç geri gönderilir", async () => {
    const f = sequence(
      json(readFirstTurn),
      json({
        id: "v2",
        status: "completed",
        steps: [{ type: "model_output", content: [{ type: "text", text: "Kasada 500 TL var." }] }],
      }),
    );

    const r = await runAssistant({
      apiKey: "k",
      message: "kasada ne kadar var",
      ctx,
      fetchFn: f,
      // Okuma aracını çalıştıran geri çağrı — veri istemciden gelir.
      runRead: (name) => (name === "getBalances" ? "Nakit: 500,00 TL" : null),
    });

    expect(r.kind).toBe("message");
    if (r.kind !== "message") return;
    expect(r.text).toBe("Kasada 500 TL var.");
    expect(f).toHaveBeenCalledTimes(2);
  });

  /** Model adımları ikinci isteğe BİREBİR girmeli (imzalar şart). */
  test("★ ikinci istek model adımlarını ve call_id'yi taşır", async () => {
    const f = sequence(
      json(readFirstTurn),
      json({ id: "v2", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "ok" }] }] }),
    );

    await runAssistant({
      apiKey: "k",
      message: "kasada ne kadar var",
      ctx,
      fetchFn: f,
      runRead: () => "Nakit: 500,00 TL",
    });

    const second = JSON.parse(String(f.mock.calls[1][1]!.body));
    expect(second.input).toHaveLength(4);
    expect(second.input[1].signature).toBe("sig-1");
    const fr = second.input[3];
    expect(fr.type).toBe("function_result");
    expect(fr.call_id).toBe("fc_1");
    expect(fr.result[0].text).toBe("Nakit: 500,00 TL");
  });

  /**
   * Yazma aracı ikinci tura GİRMEZ: niyet olarak dönüp onay
   * kartına gider. Aksi halde asistan sormadan veri değiştirirdi.
   */
  test("★ yazma aracı ikinci tura girmez, niyet döner", async () => {
    const f = sequence(json(fcBody));
    const r = await runAssistant({
      apiKey: "k",
      message: "markete 300",
      ctx,
      fetchFn: f,
      runRead: () => "olmamalı",
    });

    expect(r.kind).toBe("intent");
    expect(f).toHaveBeenCalledTimes(1);
  });

  /** `runRead` verilmezse okuma aracı niyet olarak döner (Faz 4 davranışı). */
  test("runRead yoksa okuma aracı niyet olarak döner", async () => {
    const f = sequence(json(readFirstTurn));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });
    expect(r.kind).toBe("intent");
    if (r.kind !== "intent") return;
    expect(r.intent.name).toBe("getBalances");
  });
});

describe("runAssistant -- deneme kaydı", () => {
  test("başarılı cevapta düşen ve cevap veren modeller sırayla kaydedilir", async () => {
    const f = sequence(json({ error: "quota" }, 429), json({}, 503), json(fcBody));
    const r = await runAssistant({ apiKey: "k", message: "markete 300", ctx, fetchFn: f });

    expect(r.attempts).toEqual([
      { model: MODEL_CHAIN[0], status: 429 },
      { model: MODEL_CHAIN[1], status: 503 },
      { model: MODEL_CHAIN[2], status: 200 },
    ]);
  });

  test("kalıcı hatada yalnızca denenen model kaydedilir", async () => {
    const f = sequence(json({}, 404));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    expect(r.kind).toBe("error");
    expect(r.attempts).toEqual([{ model: MODEL_CHAIN[0], status: 404 }]);
  });

  test("boş cevap ağ hatasından ayrı kaydedilir", async () => {
    const f = sequence(json({ id: "v1", status: "completed", steps: [] }), json(fcBody));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    expect(formatAttempts(r.attempts)).toBe(
      `${MODEL_CHAIN[0]}=bos, ${MODEL_CHAIN[1]}=ok`,
    );
  });
});

describe("formatAttempts", () => {
  test("durumları okunur etiketlere çevirir", () => {
    expect(
      formatAttempts([
        { model: "a", status: 429 },
        { model: "b", status: 0 },
        { model: "c", status: 200 },
      ]),
    ).toBe("a=429, b=cevap-yok, c=ok");
  });

  test("deneme yoksa boş dizge döner", () => {
    expect(formatAttempts([])).toBe("");
  });
});

describe("runAssistant -- zaman sınırı", () => {
  test("takılan model beklenmez, sıradaki cevap verir", async () => {
    let i = 0;
    const f = vi.fn<typeof fetch>((_url, init) => {
      if (i++ === 0) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        });
      }
      return Promise.resolve(json(fcBody));
    });

    const r = await runAssistant({
      apiKey: "k",
      message: "markete 300",
      ctx,
      fetchFn: f,
      timeouts: { attemptMs: 20, lastAttemptMs: 20 },
    });

    expect(r.kind).toBe("intent");
    expect(formatAttempts(r.attempts)).toBe(
      `${MODEL_CHAIN[0]}=zaman-asimi, ${MODEL_CHAIN[1]}=ok`,
    );
  });

  test("son model daha uzun sınırla çağrılır", async () => {
    const seen: number[] = [];
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      seen.push(ms);
      return new AbortController().signal;
    });
    const f = sequence(json({}, 503));

    try {
      await runAssistant({
        apiKey: "k",
        message: "x",
        ctx,
        fetchFn: f,
        timeouts: { attemptMs: 10, lastAttemptMs: 99 },
      });
    } finally {
      spy.mockRestore();
    }

    expect(seen).toEqual([...MODEL_CHAIN.slice(1).map(() => 10), 99]);
  });

  test("hepsi zaman aşımına uğrarsa 'cevap vermiyor' mesajı döner", async () => {
    const f = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );

    const r = await runAssistant({
      apiKey: "k",
      message: "x",
      ctx,
      fetchFn: f,
      timeouts: { attemptMs: 10, lastAttemptMs: 10 },
    });

    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.error).toContain("cevap vermiyor");
  });
});

describe("runAssistant -- ★ tek mesajda birden fazla işlem", () => {
  const fc = (id: string, name: string, args: Record<string, unknown>) => ({
    type: "function_call",
    id,
    name,
    arguments: args,
  });
  const tx = (id: string, amountKurus: unknown) =>
    fc(id, "createTransaction", { kind: "expense", amountKurus, date: "2026-09-21" });
  const body = (...steps: unknown[]) => json({ id: "v1", status: "requires_action", steps });

  test("her işlem ayrı niyet olarak döner, sırası korunur", async () => {
    const f = sequence(body(tx("c1", 30000), tx("c2", 50000), tx("c3", 8000)));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    expect(r.kind).toBe("intent");
    if (r.kind !== "intent") return;
    expect(r.intents.map((i) => i.args.amountKurus)).toEqual([30000, 50000, 8000]);
    expect(r.skipped).toBe(0);
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("tek işlemde de liste dolu gelir", async () => {
    const f = sequence(json(fcBody));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    if (r.kind !== "intent") throw new Error("niyet bekleniyordu");
    expect(r.intents).toEqual([r.intent]);
    expect(r.skipped).toBe(0);
  });

  test("bozuk olan atlanır ama SAYILIR -- sessizce kaybolmaz", async () => {
    const f = sequence(body(tx("c1", 30000), tx("c2", -5), tx("c3", 8000)));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    if (r.kind !== "intent") throw new Error("niyet bekleniyordu");
    expect(r.intents.map((i) => i.args.amountKurus)).toEqual([30000, 8000]);
    expect(r.skipped).toBe(1);
  });

  test("hepsi bozuksa hata döner", async () => {
    const f = sequence(body(tx("c1", -1), tx("c2", -2)));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    expect(r.kind).toBe("error");
  });

  test("yazma ile karışık gelen okuma çağrısı atlanır ve sayılır", async () => {
    const f = sequence(body(tx("c1", 30000), fc("c2", "getBalances", {}), tx("c3", 8000)));
    const r = await runAssistant({
      apiKey: "k",
      message: "x",
      ctx,
      fetchFn: f,
      runRead: () => "olmamalı",
    });

    if (r.kind !== "intent") throw new Error("niyet bekleniyordu");
    expect(r.intents.map((i) => i.name)).toEqual(["createTransaction", "createTransaction"]);
    expect(r.skipped).toBe(1);
    // Onay bekleyen yazma varken ikinci tura gidilmez.
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("tavanı aşan işlemler atlanır ve sayılır", async () => {
    const many = Array.from({ length: MAX_BATCH + 3 }, (_, i) => tx(`c${i}`, 100 + i));
    const f = sequence(body(...many));
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    if (r.kind !== "intent") throw new Error("niyet bekleniyordu");
    expect(r.intents).toHaveLength(MAX_BATCH);
    expect(r.skipped).toBe(3);
  });
});
