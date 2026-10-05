"use client";

import { useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "@/features/dictation/useSpeechRecognition";
import { supportMessage } from "@/features/dictation/support";
import { useCategories } from "@/features/categories/queries";
import { useAccounts } from "@/features/accounts/queries";
import {
  useCreateTransaction,
  useDeleteTransaction,
  useRecentTransactions,
  useUpdateTransaction,
} from "@/features/transactions/queries";
import {
  useCreateAccount,
  useArchiveAccount,
  useAccountsWithBalances,
  useUpdateAccount,
} from "@/features/accounts/queries";
import { useCreateCategory, useUpdateCategory } from "@/features/categories/queries";
import {
  useUpsertBudget,
  useDeleteBudget,
  useBudgetProgress,
} from "@/features/budgets/queries";
import {
  useAddPayment,
  useCreateDebt,
  useDebtBalances,
  useUpdateDebt,
} from "@/features/debts/queries";
import { useCreateRule, useDeleteRule, useUpdateRule } from "@/features/recurring/queries";
import { todayStr, startOfMonth } from "@/lib/date/date";
import { Button } from "@/components/ui";
import { ActionCard } from "./ActionCard";
import type { Target } from "./TargetPicker";
import { intentToTransactionInput } from "./to-input";
import {
  resolveTargetId,
  intentToAccountInput,
  intentToBudgetInput,
  intentToCategoryInput,
  intentToDebtInput,
  intentToRecurringInput,
} from "./to-write";
import {
  intentToAccountUpdate,
  intentToCategoryPatch,
  intentToDebtUpdate,
  intentToPaymentInput,
  intentToRuleUpdate,
  intentToTransactionPatch,
} from "./to-update";
import { draftToIntent } from "./local-first";
import { createParser } from "@/features/parser";
import {
  addAssistantAction,
  addAssistantError,
  addAssistantText,
  addUserMessage,
  emptyConversation,
  resolveAction,
  type Conversation,
} from "./conversation";
import type { Intent } from "./intent";

/**
 * Sohbet asistanı paneli.
 *
 * ── AKIŞ ──
 *
 *   yaz veya söyle → /api/chat → niyet → ONAY KARTI → mevcut hook
 *
 * Asistan hiçbir şeyi kendi başına kaydetmez ve Supabase'e
 * DOKUNMAZ: onay sonrası kayıt `useCreateTransaction` ile, yani
 * formların kullandığı aynı kapıdan yapılıyor.
 *
 * ── MİKROFON KORUNDU ──
 *
 * `useSpeechRecognition` aynen kullanılıyor. Ses tarayıcıda metne
 * çevrilip metin kutusuna yazılıyor; sunucuya ses GİTMİYOR.
 * Desteklenmeyen tarayıcıda mikrofon hiç gösterilmez, kullanıcı
 * yazarak devam eder — tıklandığında hiçbir şey yapmayan düğme,
 * olmayan düğmeden kötüdür.
 */

/** Faz 3'ten: `/api/chat` cevabının şekli. */
interface ChatResponse {
  intent?: Intent;
  text?: string;
  error?: string;
}

/**
 * Kural motoru — modül düzeyinde, tek sefer kurulur.
 *
 * Her render'da `createParser()` çağrılsaydı zincir yeniden
 * kurulurdu. Ayrıca bu, dikte panelindeki aynı deseni koruyor.
 */
const parser = createParser();

const NO_TARGET = "Hangi kaydı kastettiğini seçmedin.";

/** Seçilen hedefler arasından istenen türden TEK kaydı döndürür. */
function pick<K extends Target["type"]>(
  targets: readonly Target[],
  type: K,
): Extract<Target, { type: K }> | null {
  const matches = targets.filter((t): t is Extract<Target, { type: K }> => t.type === type);
  return matches.length === 1 ? matches[0] : null;
}

export function AssistantSheet({ onClose }: { onClose: () => void }) {
  const categories = useCategories();
  const accounts = useAccounts();
  const createTransaction = useCreateTransaction();
  const createAccount = useCreateAccount();
  const archiveAccount = useArchiveAccount();
  const createCategory = useCreateCategory();
  const upsertBudget = useUpsertBudget();
  const deleteBudget = useDeleteBudget();
  const createDebt = useCreateDebt();
  const createRule = useCreateRule();
  const deleteRule = useDeleteRule();
  const updateTransaction = useUpdateTransaction();
  const deleteTransaction = useDeleteTransaction();
  const updateAccount = useUpdateAccount();
  const updateCategory = useUpdateCategory();
  const updateRule = useUpdateRule();
  const updateDebt = useUpdateDebt();
  const addPayment = useAddPayment();

  /*
   * ── OKUMA ARACI VERİSİ ──
   *
   * Sunucu kullanıcının verisini görmüyor (RLS kullanıcının kendi
   * oturumuna bağlı, `service_role` yok). Okuma araçları bu yüzden
   * istemcinin önbelleğinden beslenen bir ÖZET üzerinde çalışıyor.
   * Ham liste gönderilmiyor: token maliyeti ve gereksiz veri
   * paylaşımı.
   */
  const withBalances = useAccountsWithBalances();
  const recent = useRecentTransactions(100);
  const budgets = useBudgetProgress(startOfMonth(todayStr()));
  const debts = useDebtBalances();

  const [conversation, setConversation] = useState<Conversation>(emptyConversation);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const listEnd = useRef<HTMLDivElement>(null);
  /*
   * Gönderim kilidi. State yerine ref: `setThinking(true)`
   * asenkron, ref senkron. Hızlı iki Enter'da ikinci çağrı
   * state'in güncellenmesini beklemeden eleniyor.
   */
  const sendingRef = useRef(false);
  /** Onaylanmakta olan eylemler — çift kayıt kilidi. */
  const confirmingRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /*
   * Ses metne çevrilince kutuya yaz. Otomatik GÖNDERİLMEZ:
   * kullanıcı yanlış duyulan bir cümleyi düzeltebilmeli
   * ("200" yerine "2000" duyulması tipik).
   *
   * Metin tanıma olayının kendisinde (`onFinal`) yazılıyor, bir
   * `transcript` efektinde değil: efekt yolu fazladan render ve
   * her render'da odağı kutuya çalma riski taşıyordu.
   */
  const speech = useSpeechRecognition({
    onFinal: (text) => {
      setDraft((d) => (d ? `${d} ${text}` : text));
      inputRef.current?.focus();
    },
  });

  // Yeni mesaj gelince en alta kaydır: kullanıcı cevabı görmek için
  // elle kaydırmak zorunda kalmasın.
  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "end" });
  }, [conversation.messages.length, thinking]);

  /**
   * Okuma araçlarının üzerinde çalışacağı özet.
   *
   * Kimlik GÖNDERİLMİYOR: kategori/hesap kimlikleri adlara
   * çevriliyor. Model kimliklerle bir şey yapamaz ve sızdırmanın
   * karşılığı yok.
   */
  function buildReadData() {
    const catName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
    return {
      accounts: (withBalances.data ?? []).map((a) => ({
        name: a.name,
        kind: a.kind,
        balanceKurus: a.balanceKurus,
      })),
      transactions: (recent.data ?? []).map((t) => ({
        kind: t.kind,
        amountKurus: t.amountKurus,
        date: t.date,
        categoryName: t.categoryId ? (catName.get(t.categoryId) ?? null) : null,
        note: t.note,
      })),
      budgets: (budgets.data ?? []).map((b) => ({
        categoryName: catName.get(b.categoryId) ?? "Bilinmeyen",
        limitKurus: b.limitKurus,
        spentKurus: b.spentKurus,
      })),
      debts: (debts.data ?? []).map((d) => ({
        counterparty: d.counterparty,
        direction: d.direction,
        principalKurus: d.principalKurus,
        remainingKurus: d.remainingKurus,
      })),
    };
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message) return;

    /*
     * ── ÇİFT GÖNDERİM KORUMASI ──
     *
     * `thinking` state'i render başına yakalanıyor ve
     * `setThinking(true)` asenkron. Hızlı iki Enter'da ikisi de
     * aynı render'ın `thinking: false` değerini görüp geçerdi —
     * iki istek, iki kota tüketimi, iki onay kartı.
     *
     * Ref senkron okunur/yazılır: ikinci çağrı anında elenir.
     */
    if (sendingRef.current) return;
    sendingRef.current = true;

    setConversation((c) => addUserMessage(c, message));
    setDraft("");

    /*
     * ── ÖNCE KURAL MOTORU ──
     *
     * Ücretsiz, anlık, çevrimdışı. "200 tl yemek aldım" gibi
     * cümlelerde Gemini'ye hiç gitmiyoruz: günlük kota korunur ve
     * kullanıcı ağ gecikmesi beklemez. Emin olmazsa null döner ve
     * cümle aşağıda `/api/chat`'e devredilir.
     */
    const localCtx = {
      categories: categories.data ?? [],
      accounts: accounts.data ?? [],
      defaultAccountId: accounts.data?.[0]?.id ?? null,
    };

    try {
      const parsed = await parser.parse(message, {
        categories: categories.data ?? [],
        accounts: accounts.data ?? [],
        today: todayStr(),
        defaultAccountId: localCtx.defaultAccountId,
      });
      const local = draftToIntent(parsed, localCtx);
      if (local) {
        setConversation((c) => addAssistantAction(c, local));
        // Kilit burada bırakılıyor: Gemini'ye hiç gitmedik.
        sendingRef.current = false;
        return;
      }
    } catch {
      // Kural motoru patlasa bile sohbet durmaz: Gemini'ye devret.
    }

    setThinking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          // Yalnızca ADLAR gidiyor — kimlik sunucuya bile taşınmıyor.
          context: {
            today: todayStr(),
            categories: (categories.data ?? []).map((c) => ({ name: c.name, kind: c.kind })),
            accounts: (accounts.data ?? []).map((a) => ({ name: a.name, kind: a.kind })),
          },
          readData: buildReadData(),
        }),
      });

      const body = (await res.json()) as ChatResponse;

      if (!res.ok || body.error) {
        setConversation((c) => addAssistantError(c, body.error ?? "Bir şeyler ters gitti."));
        return;
      }
      if (body.intent) {
        setConversation((c) => addAssistantAction(c, body.intent!));
        return;
      }
      if (body.text) {
        setConversation((c) => addAssistantText(c, body.text!));
        return;
      }
      setConversation((c) => addAssistantError(c, "Bunu anlayamadım, tekrar söyler misin?"));
    } catch {
      // Ağ koptu ya da cevap JSON değil. Kullanıcı çıkmazda kalmasın.
      setConversation((c) =>
        addAssistantError(c, "Sunucuya ulaşamadım. İşlemi elle de ekleyebilirsin."),
      );
    } finally {
      setThinking(false);
      sendingRef.current = false;
    }
  }

  function handleConfirm(messageId: string, intent: Intent, targets: Target[]) {
    /*
     * ── ÇİFT KAYIT KORUMASI ──
     *
     * `savingId` state'i asenkron güncellenir; yavaş ağda sabırsız
     * iki dokunuş aynı render'ın `savingId: null` değerini görüp
     * ikisi de geçerdi — aynı işlem İKİ KEZ kaydedilirdi.
     *
     * `conversation.resolveAction` zaten çözülmüş eylemi yok
     * sayıyor, ama o koruma kayıt TAMAMLANDIKTAN sonra devreye
     * giriyor; mutation'ın kendisi iki kez tetiklenmişti.
     */
    if (confirmingRef.current.has(messageId)) return;
    confirmingRef.current.add(messageId);

    const fail = (error: string) => {
      setSavingId(null);
      confirmingRef.current.delete(messageId);
      setConversation((c) => resolveAction(c, messageId, "failed", error));
    };

    /** Her mutation aynı sonuç kancalarını paylaşır. */
    const handlers = {
      onSuccess: () => {
        setSavingId(null);
        confirmingRef.current.delete(messageId);
        setConversation((c) => resolveAction(c, messageId, "done"));
      },
      onError: (err: Error) => fail(err.message),
    };

    const cats = categories.data ?? [];
    const accs = accounts.data ?? [];
    const today = todayStr();
    const args = intent.args;

    setSavingId(messageId);

    switch (intent.name) {
      case "createTransaction": {
        const r = intentToTransactionInput(args, {
          categories: cats,
          accounts: accs,
          defaultAccountId: accs[0]?.id ?? null,
        });
        if (!r.ok) return fail(r.error);
        return createTransaction.mutate(r.input, handlers);
      }

      case "createAccount": {
        const r = intentToAccountInput(args);
        if (!r.ok) return fail(r.error);
        return createAccount.mutate(r.input, handlers);
      }

      case "archiveAccount": {
        // ADDAN çözülüyor: modele kimlik gönderilmiyor, `args.id`
        // ancak uydurma olabilirdi ve sıfır satır etkilerdi.
        const t = resolveTargetId(args, "accountName", accs);
        if (!t.ok) return fail(t.error);
        return archiveAccount.mutate(t.id, handlers);
      }

      case "createCategory": {
        const r = intentToCategoryInput(args);
        if (!r.ok) return fail(r.error);
        return createCategory.mutate(r.input, handlers);
      }

      case "setBudget": {
        const r = intentToBudgetInput(args, cats, today);
        if (!r.ok) return fail(r.error);
        return upsertBudget.mutate(r.input, handlers);
      }

      case "deleteBudget": {
        // Bütçe KATEGORİYLE anılıyor; bütçe kimliği önbellekteki
        // ilerleme kayıtlarından bulunuyor.
        const t = resolveTargetId(args, "categoryName", cats);
        if (!t.ok) return fail(t.error);
        const budget = (budgets.data ?? []).find((b) => b.categoryId === t.id);
        if (!budget) return fail("Bu kategoride tanımlı bir bütçe bulamadım.");
        return deleteBudget.mutate(budget.budgetId, handlers);
      }

      case "createDebt": {
        const r = intentToDebtInput(args, today);
        if (!r.ok) return fail(r.error);
        return createDebt.mutate(r.input, handlers);
      }

      case "createRecurringRule": {
        const r = intentToRecurringInput(args, { categories: cats, accounts: accs }, today);
        if (!r.ok) return fail(r.error);
        return createRule.mutate(r.input, handlers);
      }

      /*
       * ── HEDEF SEÇEN ARAÇLAR ──
       *
       * Kaydı model tarif etti, kullanıcı onay kartında SEÇTİ
       * (`TargetPicker`). Kimlik modelden gelmiyor; burada yalnızca
       * kullanıcının seçtiği kaydın kimliği kullanılıyor. Seçim
       * boşsa kart onay düğmesini zaten kapatıyor — `pick` yine de
       * savunma olarak denetliyor.
       */
      case "updateTransaction": {
        const t = pick(targets, "transaction");
        if (!t) return fail(NO_TARGET);
        const r = intentToTransactionPatch(args, t.record, { categories: cats, accounts: accs });
        if (!r.ok) return fail(r.error);
        return updateTransaction.mutate({ id: t.id, patch: r.input }, handlers);
      }

      case "deleteTransaction": {
        const ids = targets.filter((t) => t.type === "transaction").map((t) => t.id);
        if (ids.length === 0) return fail(NO_TARGET);
        /*
         * Hook tek kayıt siliyor; toplu silme paralel çağrı. Biri
         * düşerse kaç tanesinin silindiği SÖYLENİR — "silinemedi"
         * demek, aslında silinmiş kayıtları gizlerdi.
         */
        void Promise.allSettled(ids.map((id) => deleteTransaction.mutateAsync(id))).then(
          (results) => {
            const failed = results.filter((x) => x.status === "rejected");
            if (failed.length === 0) return handlers.onSuccess();
            const reason = (failed[0] as PromiseRejectedResult).reason;
            const why = reason instanceof Error ? reason.message : "İşlem silinemedi";
            const done = ids.length - failed.length;
            fail(done > 0 ? `${done}/${ids.length} kayıt silindi. Kalanlar: ${why}` : why);
          },
        );
        return;
      }

      case "updateAccount": {
        const t = pick(targets, "account");
        if (!t) return fail(NO_TARGET);
        const r = intentToAccountUpdate(args, t.record);
        if (!r.ok) return fail(r.error);
        return updateAccount.mutate({ id: t.id, input: r.input }, handlers);
      }

      case "updateCategory": {
        const t = pick(targets, "category");
        if (!t) return fail(NO_TARGET);
        const r = intentToCategoryPatch(args, t.record);
        if (!r.ok) return fail(r.error);
        return updateCategory.mutate({ id: t.id, patch: r.input }, handlers);
      }

      case "updateRecurringRule": {
        const t = pick(targets, "rule");
        if (!t) return fail(NO_TARGET);
        const r = intentToRuleUpdate(args, t.record);
        if (!r.ok) return fail(r.error);
        return updateRule.mutate({ id: t.id, input: r.input }, handlers);
      }

      case "deleteRecurringRule": {
        // Eskiden `String(args.id)` ile bağlıydı: modele kimlik
        // gitmediği için o kimlik ancak uydurma olabilirdi ve silme
        // sıfır satır etkileyip "uygulandı" diyordu.
        const t = pick(targets, "rule");
        if (!t) return fail(NO_TARGET);
        return deleteRule.mutate(t.id, handlers);
      }

      case "updateDebt": {
        const t = pick(targets, "debt");
        if (!t) return fail(NO_TARGET);
        const r = intentToDebtUpdate(args, t.record);
        if (!r.ok) return fail(r.error);
        return updateDebt.mutate({ id: t.id, input: r.input }, handlers);
      }

      case "addDebtPayment": {
        const t = pick(targets, "debt");
        if (!t) return fail(NO_TARGET);
        const r = intentToPaymentInput(args, t.record, accs, today);
        if (!r.ok) return fail(r.error);
        return addPayment.mutate(
          { input: r.input, direction: t.record.direction, counterparty: t.record.counterparty },
          handlers,
        );
      }

      default:
        return fail("Bunu henüz uygulayamıyorum. İlgili sayfadan elle yapabilirsin.");
    }
  }

  const listening = speech.state === "listening";
  const micSupported = speech.support.supported;
  /*
   * Mikrofon yoksa SEBEBİ söylenir. Düğmeyi sessizce gizlemek
   * "bu uygulamada sesli giriş yok" izlenimi verirdi; oysa
   * Firefox/Safari'de API yok ya da sayfa http:// üzerinden
   * açılmış olabilir — ikisi de kullanıcının çözebileceği şeyler.
   */
  const micNote = supportMessage(speech.support);

  return (
    <div className="flex max-h-[80dvh] flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Asistan</h2>
        <Button variant="ghost" onClick={onClose}>
          Kapat
        </Button>
      </div>

      <div className="min-h-[12rem] flex-1 overflow-y-auto px-4 py-3">
        {conversation.messages.length === 0 && !thinking ? (
          <Welcome />
        ) : (
          <ul className="flex flex-col gap-3">
            {conversation.messages.map((m) => (
              <li key={m.id}>
                {m.action ? (
                  <ActionCard
                    id={m.id}
                    action={m.action}
                    saving={savingId === m.id}
                    onConfirm={(targets) => handleConfirm(m.id, m.action!.intent, targets)}
                    onCancel={() =>
                      setConversation((c) => resolveAction(c, m.id, "cancelled"))
                    }
                  />
                ) : (
                  <Bubble role={m.role} isError={m.isError}>
                    {m.text}
                  </Bubble>
                )}
              </li>
            ))}
          </ul>
        )}

        {thinking && (
          <p role="status" className="mt-3 text-[13px] text-[var(--ink-3)]">
            Düşünüyorum…
          </p>
        )}

        {listening && (
          <p role="status" className="mt-3 text-[13px] text-[var(--ink-3)]">
            Dinliyorum… {speech.interim}
          </p>
        )}

        {speech.error && (
          <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
            {speech.error}
          </p>
        )}

        {micNote && conversation.messages.length === 0 && (
          <p className="mt-3 text-[13px] text-[var(--ink-3)]">{micNote}</p>
        )}

        <div ref={listEnd} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        className="flex items-end gap-2 border-t border-[var(--border)] px-4 py-3"
      >
        <label htmlFor="asistan-giris" className="sr-only">
          Asistana yaz
        </label>
        <textarea
          id="asistan-giris"
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter gönderir, Shift+Enter satır atlar — sohbet
            // kutularının beklenen davranışı.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={1}
          placeholder="Örnek: bugün markete 300 lira harcadım"
          className={[
            "min-h-9 max-h-32 flex-1 resize-none rounded-[var(--r-md)] px-3 py-2 text-sm",
            "border border-[var(--border-strong)] bg-[var(--bg)] text-[var(--ink)]",
            "placeholder:text-[var(--ink-3)]",
            "focus:border-[var(--brand)] focus:outline-none",
            "transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]",
          ].join(" ")}
        />

        {micSupported && (
          <button
            type="button"
            onClick={listening ? speech.stop : speech.start}
            aria-label={listening ? "Kaydı durdur" : "Sesli giriş başlat"}
            aria-pressed={listening}
            className={[
              "grid size-9 shrink-0 place-items-center rounded-[var(--r-md)]",
              "transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]",
              listening
                ? "bg-[var(--expense)] text-[var(--on-expense)]"
                : "bg-[var(--surface-2)] text-[var(--ink-2)] hover:text-[var(--ink)]",
            ].join(" ")}
          >
            <MicGlyph />
          </button>
        )}

        <Button variant="primary" type="submit" disabled={!draft.trim() || thinking}>
          Gönder
        </Button>
      </form>
    </div>
  );
}

/**
 * Boş durum.
 *
 * "Henüz mesaj yok" demek hiçbir şey öğretmez. Örnekler arayüzün
 * ne yapabildiğini gösteriyor ve ilk cümleyi yazmayı kolaylaştırıyor.
 */
function Welcome() {
  return (
    <div className="flex flex-col gap-2 py-4">
      <p className="text-sm text-[var(--ink-2)]">
        İşlem ekleyebilir, harcamanı sorabilirsin.
      </p>
      <ul className="flex flex-col gap-1 text-[13px] text-[var(--ink-3)]">
        <li>“bugün markete 300 lira harcadım”</li>
        <li>“bu ay ne kadar harcadım”</li>
        <li>“kasada ne kadar var”</li>
      </ul>

      {/*
        ── AÇIK BİLGİLENDİRME ──

        Soru sorduğunda hesap/kategori adları, tutarlar, açıklama
        notları ve borç kişi adları Google'ın Gemini servisine
        gidiyor. Bu, özelliğin çalışması için gerekli ama
        kullanıcının BİLMESİ gereken bir şey: notlarda "Ayşe'ye
        hediye" gibi kişisel içerik olabilir.

        Basit işlem eklemede (kural motoru yeterliyken) hiçbir veri
        dışarı çıkmıyor — o yüzden "soru sorduğunda" deniyor.
      */}
      <p className="mt-2 text-[13px] text-[var(--ink-3)]">
        Soru sorduğunda hesap ve kategori adların, tutarlar ve açıklama notların
        Google&apos;ın yapay zekâ servisine gönderilir. Basit işlem eklemede hiçbir
        şey dışarı çıkmaz.
      </p>
    </div>
  );
}

function Bubble({
  role,
  isError,
  children,
}: {
  role: "user" | "assistant";
  isError?: boolean;
  children: React.ReactNode;
}) {
  const mine = role === "user";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <p
        className={[
          "max-w-[85%] whitespace-pre-wrap rounded-[var(--r-lg)] px-3 py-2 text-sm",
          mine
            ? "bg-[var(--brand-soft)] text-[var(--brand-ink)]"
            : isError
              ? "bg-[var(--surface-2)] text-[var(--danger)]"
              : "bg-[var(--surface-2)] text-[var(--ink-2)]",
        ].join(" ")}
        {...(isError ? { role: "alert" } : {})}
      >
        {children}
      </p>
    </div>
  );
}

function MicGlyph() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}
