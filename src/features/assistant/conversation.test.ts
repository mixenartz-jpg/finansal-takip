import { describe, expect, test } from "vitest";
import {
  emptyConversation,
  addUserMessage,
  addAssistantText,
  addAssistantAction,
  addAssistantError,
  resolveAction,
  MAX_MESSAGES,
} from "./conversation";

/**
 * Sohbet durumu — SAF mantık.
 *
 * Testler `node` ortamında koşuyor (bkz. vitest.config.mts), o
 * yüzden React dışında tutuldu. Bu, mesaj listesinin kenar
 * durumlarını (sıra, kesme, onay sonrası durum) jsdom kurmadan
 * sınamayı mümkün kılıyor — ve asıl kırılgan yer burası, görsel
 * kabuk değil.
 */

describe("addUserMessage", () => {
  test("boş sohbete mesaj ekler", () => {
    const c = addUserMessage(emptyConversation(), "markete 300 attım");
    expect(c.messages).toHaveLength(1);
    expect(c.messages[0]).toMatchObject({ role: "user", text: "markete 300 attım" });
  });

  test("sıra korunur", () => {
    let c = emptyConversation();
    c = addUserMessage(c, "bir");
    c = addAssistantText(c, "iki");
    c = addUserMessage(c, "üç");
    expect(c.messages.map((m) => m.text)).toEqual(["bir", "iki", "üç"]);
  });

  /** Her mesajın tekil kimliği olmalı: React `key` buna dayanıyor. */
  test("kimlikler tekrarsız", () => {
    let c = emptyConversation();
    for (let i = 0; i < 10; i++) c = addUserMessage(c, `m${i}`);
    const ids = c.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * ── DEĞİŞMEZLİK ──
   *
   * Proje kuralı: nesneler yerinde değiştirilmez. React da buna
   * güveniyor — aynı dizi referansı dönerse liste yeniden
   * çizilmez ve kullanıcı mesajını göremez.
   */
  test("★ girdi nesnesi DEĞİŞTİRİLMEZ", () => {
    const before = emptyConversation();
    const after = addUserMessage(before, "x");
    expect(before.messages).toHaveLength(0);
    expect(after).not.toBe(before);
    expect(after.messages).not.toBe(before.messages);
  });
});

describe("addAssistantAction", () => {
  const intent = { name: "createTransaction", args: { amountKurus: 30000 }, needsConfirm: true };

  test("onay bekleyen eylem ekler", () => {
    const c = addAssistantAction(emptyConversation(), intent);
    const m = c.messages[0];
    expect(m.role).toBe("assistant");
    expect(m.action).toMatchObject({ intent, status: "pending" });
  });

  test("okuma aracı onay beklemez", () => {
    const read = { name: "getBalances", args: {}, needsConfirm: false };
    const c = addAssistantAction(emptyConversation(), read);
    expect(c.messages[0].action?.status).toBe("pending");
    expect(c.messages[0].action?.intent.needsConfirm).toBe(false);
  });
});

describe("resolveAction", () => {
  const intent = { name: "createTransaction", args: {}, needsConfirm: true };

  test("onaylanan eylem 'done' olur", () => {
    let c = addAssistantAction(emptyConversation(), intent);
    const id = c.messages[0].id;
    c = resolveAction(c, id, "done");
    expect(c.messages[0].action?.status).toBe("done");
  });

  test("vazgeçilen eylem 'cancelled' olur", () => {
    let c = addAssistantAction(emptyConversation(), intent);
    c = resolveAction(c, c.messages[0].id, "cancelled");
    expect(c.messages[0].action?.status).toBe("cancelled");
  });

  test("başarısız eylem hata metnini taşır", () => {
    let c = addAssistantAction(emptyConversation(), intent);
    c = resolveAction(c, c.messages[0].id, "failed", "Tutar sıfırdan büyük olmalı.");
    expect(c.messages[0].action?.status).toBe("failed");
    expect(c.messages[0].action?.error).toBe("Tutar sıfırdan büyük olmalı.");
  });

  /**
   * ── ÇİFT KAYIT KORUMASI ──
   *
   * Kullanıcı "Onayla"ya iki kez dokunabilir (yavaş ağda sabırsızlık
   * tipik). İkinci dokunuş aynı işlemi tekrar kaydetmemeli. Durum
   * 'pending' değilse çözümleme yok sayılıyor.
   */
  test("★ zaten çözülmüş eylem tekrar çözülemez", () => {
    let c = addAssistantAction(emptyConversation(), intent);
    const id = c.messages[0].id;
    c = resolveAction(c, id, "done");
    const after = resolveAction(c, id, "cancelled");
    expect(after.messages[0].action?.status).toBe("done");
  });

  test("bilinmeyen kimlik sohbeti değiştirmez", () => {
    const c = addAssistantAction(emptyConversation(), intent);
    const after = resolveAction(c, "yok-boyle-bir-id", "done");
    expect(after.messages[0].action?.status).toBe("pending");
  });

  test("diğer mesajlara dokunulmaz", () => {
    let c = addUserMessage(emptyConversation(), "selam");
    c = addAssistantAction(c, intent);
    c = addUserMessage(c, "devam");
    const actionId = c.messages[1].id;
    c = resolveAction(c, actionId, "done");

    expect(c.messages[0].text).toBe("selam");
    expect(c.messages[2].text).toBe("devam");
    expect(c.messages[1].action?.status).toBe("done");
  });
});

describe("addAssistantError", () => {
  test("hata mesajı asistan rolüyle eklenir", () => {
    const c = addAssistantError(emptyConversation(), "Yapay zeka yoğun.");
    expect(c.messages[0]).toMatchObject({
      role: "assistant",
      text: "Yapay zeka yoğun.",
      isError: true,
    });
  });
});

describe("mesaj tavanı", () => {
  /**
   * ── NEDEN TAVAN VAR ──
   *
   * Sohbet sınırsız büyürse uzun oturumda liste yavaşlar ve bellek
   * şişer. En eski mesajlar düşer; kullanıcı son konuşmayı görür.
   */
  test("★ tavan aşılınca EN ESKİ mesajlar düşer", () => {
    let c = emptyConversation();
    for (let i = 0; i < MAX_MESSAGES + 10; i++) c = addUserMessage(c, `m${i}`);

    expect(c.messages).toHaveLength(MAX_MESSAGES);
    // Son mesaj korunmalı, ilkler düşmeli.
    expect(c.messages.at(-1)?.text).toBe(`m${MAX_MESSAGES + 9}`);
    expect(c.messages[0].text).toBe("m10");
  });
});
