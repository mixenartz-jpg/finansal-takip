import type { Intent } from "./intent";

/**
 * Sohbet durumu.
 *
 * ── NEDEN REACT'TEN AYRI ──
 *
 * Mesaj listesinin kırılgan yeri görsel kabuk değil, durum
 * geçişleri: sıra, çift onay, tavan aşımı. Bunlar saf fonksiyon
 * olarak tutulduğunda `node` ortamında (bkz. vitest.config.mts)
 * jsdom kurmadan sınanabiliyor.
 *
 * Tüm fonksiyonlar YENİ nesne döndürür; hiçbiri girdiyi
 * değiştirmez. React aynı referansı görürse listeyi yeniden
 * çizmez ve kullanıcı kendi mesajını göremez.
 */

/** Sohbette tutulan en fazla mesaj. */
export const MAX_MESSAGES = 50;

export type ActionStatus = "pending" | "done" | "cancelled" | "failed";

export interface PendingAction {
  intent: Intent;
  status: ActionStatus;
  /** Yalnızca `failed` durumunda: kullanıcıya gösterilecek sebep. */
  error?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string | null;
  /** Asistan bir eylem önerdiyse buradadır. */
  action?: PendingAction;
  /** Hata mesajı mı — arayüz farklı boyuyor. */
  isError?: boolean;
}

export interface Conversation {
  messages: readonly Message[];
}

export function emptyConversation(): Conversation {
  return { messages: [] };
}

/**
 * Tekil kimlik üretir.
 *
 * `crypto.randomUUID` her modern tarayıcıda var ama güvenli
 * olmayan bağlamda (http://) tanımsız olabilir; sayaç yedeği
 * React `key` çakışmasını önlüyor.
 */
let counter = 0;
function nextId(): string {
  counter += 1;
  try {
    return crypto.randomUUID();
  } catch {
    return `m-${counter}-${Date.now()}`;
  }
}

/** Tavanı aşan en eski mesajları düşürür. */
function capped(messages: readonly Message[]): readonly Message[] {
  return messages.length <= MAX_MESSAGES ? messages : messages.slice(-MAX_MESSAGES);
}

function append(c: Conversation, message: Message): Conversation {
  return { messages: capped([...c.messages, message]) };
}

export function addUserMessage(c: Conversation, text: string): Conversation {
  return append(c, { id: nextId(), role: "user", text });
}

export function addAssistantText(c: Conversation, text: string): Conversation {
  return append(c, { id: nextId(), role: "assistant", text });
}

export function addAssistantError(c: Conversation, text: string): Conversation {
  return append(c, { id: nextId(), role: "assistant", text, isError: true });
}

export function addAssistantAction(c: Conversation, intent: Intent): Conversation {
  return append(c, {
    id: nextId(),
    role: "assistant",
    text: null,
    action: { intent, status: "pending" },
  });
}

/**
 * Bir eylemin sonucunu işler.
 *
 * ── ÇİFT KAYIT KORUMASI ──
 *
 * Yalnızca `pending` durumundaki eylem çözülebilir. Kullanıcı
 * yavaş ağda "Onayla"ya iki kez dokunduğunda ikinci dokunuş aynı
 * işlemi tekrar kaydetmemeli.
 */
export function resolveAction(
  c: Conversation,
  messageId: string,
  status: Exclude<ActionStatus, "pending">,
  error?: string,
): Conversation {
  return {
    messages: c.messages.map((m) => {
      if (m.id !== messageId || !m.action) return m;
      if (m.action.status !== "pending") return m;
      return { ...m, action: { ...m.action, status, error } };
    }),
  };
}

/**
 * Toplu onaya girebilen araçlar.
 *
 * ── NEDEN İZİN LİSTESİ ──
 *
 * Toplu onay, kullanıcının her kartı tek tek okumadığı andır. Beş
 * harcamayı birlikte onaylamak zararsız; aralarına karışmış bir
 * silmeyi fark etmeden onaylamak değil. Yasak listesi tutulsaydı
 * yarın eklenen bir silme aracı kendiliğinden toplu onaya girerdi.
 *
 * Güncelleme araçları da dışarıda: henüz bağlı değiller, toplu
 * onayda yalnızca hata üretirlerdi.
 */
const BULK_SAFE_TOOLS: readonly string[] = [
  "createTransaction",
  "createAccount",
  "createCategory",
  "createDebt",
  "createRecurringRule",
  "setBudget",
];

/** Eylem taşıdığı tipte de görünen mesaj. */
export type ActionMessage = Message & { action: PendingAction };

/** "Hepsini onayla"nın kapsadığı mesajlar, sohbet sırasıyla. */
export function bulkConfirmable(c: Conversation): readonly ActionMessage[] {
  return c.messages.filter(
    (m): m is ActionMessage =>
      m.action !== undefined &&
      m.action.status === "pending" &&
      m.action.intent.needsConfirm &&
      BULK_SAFE_TOOLS.includes(m.action.intent.name),
  );
}
