# Asistan Altyapısı (Faz 3) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doğal dil cümlesini, uygulamanın mevcut mutation hook'larına karşılık gelen **doğrulanmış bir niyet nesnesine** çeviren sunucu altyapısı — arayüz yok, tamamen testlerle sürülür.

**Architecture:** `/api/chat` route handler'ı Gemini'yi çağırır, Gemini araç-çağırma (function calling) ile bir niyet üretir, route bunu **kendi şemasıyla doğrular** ve istemciye döndürür. Gemini'nin veritabanına erişimi yoktur; yazma işini Faz 4'te istemci, mevcut hook'lar üzerinden yapar. Model zinciri 429/5xx'te sıradaki modele düşer.

**Tech Stack:** Next.js 16 route handler (App Router), TypeScript, Gemini **Interactions API** (`v1beta/interactions`, REST — SDK yok), Vitest (`environment: "node"`).

**Spec:** `docs/superpowers/specs/2026-09-20-chatbot-dark-tema-design.md`

---

## Global Constraints

- **`GEMINI_API_KEY` yalnızca sunucuda.** `NEXT_PUBLIC_` öneki YASAK — anahtar istemci paketine gömülür ve herkese açılır.
- **Gemini veritabanına dokunmaz.** Sunucuya giden: sohbet metni + kategori/hesap **adları**. Dönen: niyet nesnesi.
- **Tek yazma kapısı korunur.** Bu faz hiçbir şey yazmaz; yalnızca niyet üretir. Yazma Faz 4'te `features/*/queries.ts` hook'larıyla yapılır.
- **Niyet nesnesi ASLA güvenilmez.** Gemini'nin döndürdüğü her araç adı ve her argüman kendi şemamızdan geçer. Şemaya uymayan niyet reddedilir.
- **Arayüz dili Türkçe.** Kullanıcıya görünen her metin Türkçe.
- **Vitest ortamı `node`** (`vitest.config.mts`) — DOM YOK, bilinçli seçim. Ağ çağrıları enjekte edilen `fetch` ile test edilir; gerçek ağ isteği atan test YAZILMAZ.
- **Testler:** `npm test` yeşil olmadan görev bitmez.
- **Para `Kurus`** (markalı tam sayı), **tarih `DateStr`** (`'YYYY-MM-DD'`, markalı string). Float para YASAK.
- **`npm run lint` ÇALIŞMIYOR** (ESLint config'i çöküyor, `main`'de de bozuk). Kalite kapısı olarak `npx tsc --noEmit` + `npm test` kullan.

---

## Gemini Interactions API — doğrulanmış gerçekler

> Bu bölüm `context7` MCP ile `ai.google.dev/gemini-api` dokümantasyonundan **2026-09-21'de doğrulandı.** Ezberden yazılmadı. Spec'in şartı buydu.

**KRİTİK:** Eski `models/<model>:generateContent` + `contents[].parts[].functionCall` deseni **artık birincil değil.** Güncel API:

- **Endpoint:** `POST https://generativelanguage.googleapis.com/v1beta/interactions`
- **Kimlik:** `x-goog-api-key: <GEMINI_API_KEY>` başlığı (URL'de `?key=` DEĞİL)
- **Araç biçimi:** düz dizi — `tools: [{ type: "function", name, description, parameters }]`.
  Eski `tools: [{ functionDeclarations: [...] }]` sarmalayıcısı DEĞİL.
- **Cevap biçimi:** `{ id, status, steps: [...], model }`.
  - Araç çağrısı gerektiğinde `status: "requires_action"` ve
    `steps[]` içinde `{ type: "function_call", id, name, arguments }`.
  - `arguments` **nesnedir**, JSON string değil.
- **Durumsuz mod:** `store: false` + geçmişi `input` dizisinde elle taşı.
  Bu projede `store: false` kullanılır (sunucuda oturum durumu tutmuyoruz).
- **Kullanıcı mesajı:** `input: [{ type: "user_input", content: "..." }]`
- **Gemini 3.x katı eşleşme:** her `function_result` ilgili `call_id`'yi taşımak ZORUNDA.
  Bu faz tek tur çalıştığı için sonuç geri göndermiyoruz; Faz 4'ün işi.

Bu faz **yalnızca 1. turu** kullanır: metin gönder → `function_call` al → doğrula → döndür.

---

## Dosya Yapısı

```
src/features/assistant/
├── tools.ts              Araç tanımları (Gemini'ye giden şema) + TS tipleri
├── tools.test.ts         Tanımların şema sözleşmesi
├── intent.ts             Niyet doğrulaması: unknown → Intent | hata
├── intent.test.ts        Doğrulama testleri (kötü girdi ağırlıklı)
├── models.ts             Model zinciri sırası + düşme kararı
├── models.test.ts        Hangi hata zinciri ilerletir
├── gemini.ts             Interactions API istemcisi (fetch enjekte edilir)
├── gemini.test.ts        İstek şekli + cevap ayrıştırma (sahte fetch)
├── chain.ts              Model zinciri yürütücüsü
├── chain.test.ts         Düşme davranışı uçtan uca (sahte fetch)
└── prompt.ts             Sistem yönergesi + bağlam özeti kurucu

src/app/api/chat/
└── route.ts              POST handler — oturum kontrolü + zincir çağrısı

.env.example              GEMINI_API_KEY yorumu açılır
```

**Neden bu kadar çok küçük dosya:** her biri tek sorumluluk taşıyor ve `node` ortamında DOM'suz test edilebiliyor. `gemini.ts` ağ biçimini bilir, `intent.ts` güvenliği bilir, `models.ts` kota politikasını bilir. Bunları tek dosyaya koymak, birini test etmek için diğerini taklit etmeyi gerektirirdi.

---

## Task 1: Araç tanımları

**Files:**
- Create: `src/features/assistant/tools.ts`
- Test: `src/features/assistant/tools.test.ts`

**Interfaces:**
- Produces: `TOOLS` (Gemini'ye giden dizi), `TOOL_NAMES`, `ToolName`, `WRITE_TOOLS`

- [x] **Step 1: Write the failing test**

Create `src/features/assistant/tools.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { TOOLS, TOOL_NAMES, WRITE_TOOLS, isToolName } from "./tools";

/**
 * Araç tanımlarının ŞEMA SÖZLEŞMESİ.
 *
 * Bu testler "Gemini ne yapıyor" değil, "biz ona ne gönderiyoruz"
 * sorusunu doğrular. Bozuk bir tanım (eksik `type`, boş `description`)
 * Gemini tarafından SESSİZCE yok sayılır: model aracı hiç çağırmaz,
 * kullanıcı "asistan beni anlamadı" der ve sebebi hiçbir yerde
 * görünmez. Bu yüzden biçim burada kilitleniyor.
 */

describe("TOOLS -- Interactions API biçimi", () => {
  test("her araç type:'function' taşır", () => {
    for (const t of TOOLS) {
      expect(t.type, `${t.name} type alanı yanlış`).toBe("function");
    }
  });

  test("her aracın adı ve açıklaması var", () => {
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*$/);
      // Boş açıklama = model aracın ne işe yaradığını bilmiyor.
      expect(t.description.length, `${t.name} açıklaması çok kısa`).toBeGreaterThan(15);
    }
  });

  test("her aracın parametre şeması nesne tipinde", () => {
    for (const t of TOOLS) {
      expect(t.parameters.type, `${t.name} parameters.type`).toBe("object");
      expect(t.parameters.properties, `${t.name} properties yok`).toBeTruthy();
    }
  });

  /**
   * `required` içindeki her ad `properties` içinde TANIMLI olmalı.
   * Olmayan bir alanı zorunlu ilan etmek, modelin her çağrıda
   * uyduracağı bir alan demektir.
   */
  test("required alanları properties içinde tanımlı", () => {
    for (const t of TOOLS) {
      for (const req of t.parameters.required ?? []) {
        expect(
          Object.keys(t.parameters.properties),
          `${t.name}: "${req}" zorunlu ama tanımsız`,
        ).toContain(req);
      }
    }
  });

  test("araç adları tekrarsız", () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });

  test("isToolName tanımsız adı reddeder", () => {
    expect(isToolName("getBalances")).toBe(true);
    expect(isToolName("dropDatabase")).toBe(false);
    expect(isToolName("")).toBe(false);
    expect(isToolName(null)).toBe(false);
  });

  /**
   * Yazma araçları AYRI listelenmeli: Faz 4'te onay kartı yalnızca
   * bu listeye bakarak "bu niyet onay ister mi" kararını verecek.
   * Okuma aracı yanlışlıkla bu listeye girerse kullanıcı bakiyesini
   * sormak için bile onay vermek zorunda kalır.
   */
  test("WRITE_TOOLS yalnızca yazma araçlarını içerir", () => {
    for (const name of WRITE_TOOLS) {
      expect(TOOL_NAMES, `${name} TOOLS içinde yok`).toContain(name);
      expect(name).toMatch(/^(create|update|delete|archive|set|add)/);
    }
    // Okuma araçları listede OLMAMALI.
    for (const read of ["getBalances", "getSpending", "findTransactions"]) {
      expect(WRITE_TOOLS as readonly string[]).not.toContain(read);
    }
  });

  test("spec'teki okuma araçlarının hepsi var", () => {
    for (const name of [
      "getBalances",
      "getSpending",
      "getBudgetStatus",
      "getDebts",
      "findTransactions",
    ]) {
      expect(TOOL_NAMES).toContain(name);
    }
  });

  test("spec'teki yazma araçlarının hepsi var", () => {
    for (const name of [
      "createTransaction",
      "updateTransaction",
      "deleteTransaction",
      "createAccount",
      "updateAccount",
      "archiveAccount",
      "createCategory",
      "updateCategory",
      "setBudget",
      "deleteBudget",
      "createRecurringRule",
      "updateRecurringRule",
      "deleteRecurringRule",
      "createDebt",
      "updateDebt",
      "addDebtPayment",
    ]) {
      expect(TOOL_NAMES).toContain(name);
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/assistant/tools.test.ts`
Expected: FAIL — `Cannot find module './tools'`

- [x] **Step 3: Create the tool definitions**

Create `src/features/assistant/tools.ts`:

```typescript
/**
 * Gemini araç tanımları.
 *
 * ── BİÇİM NEDEN BÖYLE ──
 *
 * Interactions API araçları DÜZ DİZİ olarak bekler:
 *   tools: [{ type: "function", name, description, parameters }]
 *
 * Eski `generateContent` API'sinin `tools: [{ functionDeclarations: [] }]`
 * sarmalayıcısı DEĞİL. Bu biçim 2026-09-21'de context7 ile
 * ai.google.dev dokümantasyonundan doğrulandı.
 *
 * ── HER ARAÇ BİR HOOK'UN KARŞILIĞI ──
 *
 * Araç setinin tamamı mevcut mutation/query hook'larına birebir
 * karşılık gelir. Gemini'nin veritabanına erişimi YOKTUR; bu
 * tanımlar yalnızca "kullanıcı ne yapmak istiyor" sorusunu
 * yapılandırılmış hale getirir.
 *
 * ── PARA VE TARİH ──
 *
 * Tutarlar `amountKurus` adıyla ve KURUŞ cinsinden istenir; lira
 * istemek modelin 12.50 gibi kesirli sayı üretmesine yol açar ve
 * float para bu projede yasaktır. Tarihler 'YYYY-MM-DD'.
 */

/** Interactions API'nin beklediği araç biçimi. */
export interface ToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: readonly string[];
  };
}

const AMOUNT = {
  type: "integer",
  description: "Tutar, KURUŞ cinsinden tam sayı. 12,50 TL = 1250.",
} as const;

const DATE = {
  type: "string",
  description: "Tarih, 'YYYY-MM-DD' biçiminde.",
} as const;

const ID = (what: string) =>
  ({
    type: "string",
    description: `${what} kimliği (bağlamda verilen listeden alınır).`,
  }) as const;

export const TOOLS: readonly ToolDefinition[] = [
  // ─────────────────────── Okuma ───────────────────────
  {
    type: "function",
    name: "getBalances",
    description:
      "Tüm hesapların güncel bakiyesini getirir. 'Kasada ne kadar var', 'bakiyem ne' gibi sorular için.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "getSpending",
    description:
      "Bir tarih aralığındaki harcamayı kategoriye göre toplar. 'Bu ay yemeğe ne harcadım' gibi sorular için.",
    parameters: {
      type: "object",
      properties: {
        from: DATE,
        to: DATE,
        categoryName: {
          type: "string",
          description: "Tek bir kategoriyle sınırlamak için kategori adı. Boş bırakılırsa tümü.",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    type: "function",
    name: "getBudgetStatus",
    description:
      "Bütçelerin ne kadarının kullanıldığını getirir. 'Bütçeyi aştım mı' gibi sorular için.",
    parameters: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description: "Ay, 'YYYY-MM' biçiminde. Boş bırakılırsa bu ay.",
        },
      },
    },
  },
  {
    type: "function",
    name: "getDebts",
    description: "Borçları ve kalan tutarlarını getirir. 'Kime borcum var' gibi sorular için.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "findTransactions",
    description:
      "Tarih aralığına ve isteğe bağlı kategoriye göre işlemleri listeler. Güncelleme veya silme niyetinden ÖNCE hangi kaydın kastedildiğini bulmak için kullanılır.",
    parameters: {
      type: "object",
      properties: {
        from: DATE,
        to: DATE,
        categoryName: { type: "string", description: "Kategori adı ile daralt." },
        note: { type: "string", description: "Açıklamada geçen metin ile daralt." },
      },
      required: ["from", "to"],
    },
  },

  // ─────────────────────── Yazma: işlem ───────────────────────
  {
    type: "function",
    name: "createTransaction",
    description: "Yeni bir gelir, gider veya transfer işlemi oluşturur.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["income", "expense", "transfer"],
          description: "İşlem türü.",
        },
        amountKurus: AMOUNT,
        date: DATE,
        accountName: { type: "string", description: "Hesap adı." },
        counterAccountName: {
          type: "string",
          description: "Transferde hedef hesap adı. Yalnızca transfer için.",
        },
        categoryName: {
          type: "string",
          description: "Kategori adı. Transferde BOŞ bırakılır.",
        },
        note: { type: "string", description: "Kısa açıklama." },
      },
      required: ["kind", "amountKurus", "date"],
    },
  },
  {
    type: "function",
    name: "updateTransaction",
    description:
      "Var olan bir işlemi günceller. Yalnızca değişecek alanlar verilir; verilmeyen alanlar olduğu gibi kalır.",
    parameters: {
      type: "object",
      properties: {
        id: ID("İşlem"),
        kind: { type: "string", enum: ["income", "expense", "transfer"] },
        amountKurus: AMOUNT,
        date: DATE,
        accountName: { type: "string" },
        counterAccountName: { type: "string" },
        categoryName: { type: "string" },
        note: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "deleteTransaction",
    description: "Bir veya daha fazla işlemi siler.",
    parameters: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Silinecek işlemlerin kimlikleri.",
        },
      },
      required: ["ids"],
    },
  },

  // ─────────────────────── Yazma: hesap ───────────────────────
  {
    type: "function",
    name: "createAccount",
    description: "Yeni bir hesap açar (nakit, banka veya kredi kartı).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Hesap adı." },
        kind: { type: "string", enum: ["cash", "bank", "credit_card"] },
        // NEGATİF olabilir: kredi kartında açılış bakiyesi borçtur
        // (0001_schema.sql'de `opening_kurus`'ta > 0 kısıtı YOK).
        // `parseIntent` bu alanı SIGNED_AMOUNT_KEYS listesi sayesinde
        // pozitiflik kuralından muaf tutar — bkz. Task 2.
        openingKurus: {
          type: "integer",
          description:
            "Açılış bakiyesi, kuruş. Kredi kartında negatif olabilir (borç).",
        },
        creditLimitKurus: {
          ...AMOUNT,
          description: "Kredi limiti, kuruş. YALNIZCA kredi kartında.",
        },
      },
      required: ["name", "kind"],
    },
  },
  {
    type: "function",
    name: "updateAccount",
    description: "Var olan bir hesabın adını veya limitini günceller.",
    parameters: {
      type: "object",
      properties: {
        id: ID("Hesap"),
        name: { type: "string" },
        creditLimitKurus: AMOUNT,
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "archiveAccount",
    description: "Bir hesabı arşivler. Hesap silinmez, listelerde görünmez olur.",
    parameters: {
      type: "object",
      properties: { id: ID("Hesap") },
      required: ["id"],
    },
  },

  // ─────────────────────── Yazma: kategori ───────────────────────
  {
    type: "function",
    name: "createCategory",
    description: "Yeni bir gelir veya gider kategorisi oluşturur.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["income", "expense"] },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Sesli girişte bu kategoriye eşlenecek kelimeler.",
        },
      },
      required: ["name", "kind"],
    },
  },
  {
    type: "function",
    name: "updateCategory",
    description:
      "Kategorinin adını veya anahtar kelimelerini günceller. TÜR, kategoriye bağlı kayıt varsa değiştirilemez.",
    parameters: {
      type: "object",
      properties: {
        id: ID("Kategori"),
        name: { type: "string" },
        keywords: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
  },

  // ─────────────────────── Yazma: bütçe ───────────────────────
  {
    type: "function",
    name: "setBudget",
    description: "Bir kategori için aylık bütçe belirler veya güncelleniyorsa üzerine yazar.",
    parameters: {
      type: "object",
      properties: {
        categoryName: { type: "string" },
        limitKurus: { ...AMOUNT, description: "Aylık bütçe limiti, kuruş." },
        month: { type: "string", description: "Ay, 'YYYY-MM'. Boş bırakılırsa bu ay." },
      },
      required: ["categoryName", "limitKurus"],
    },
  },
  {
    type: "function",
    name: "deleteBudget",
    description: "Bir kategorinin bütçesini kaldırır.",
    parameters: {
      type: "object",
      properties: { id: ID("Bütçe") },
      required: ["id"],
    },
  },

  // ─────────────────────── Yazma: düzenli ödeme ───────────────────────
  {
    type: "function",
    name: "createRecurringRule",
    description:
      "Düzenli (yinelenen) bir ödeme veya gelir kuralı oluşturur. Transfer kuralı DESTEKLENMEZ.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Kural adı, örn. 'Kira'." },
        // Şemada `kind <> 'transfer'` kısıtı var (0007_recurring.sql).
        kind: { type: "string", enum: ["income", "expense"] },
        amountKurus: AMOUNT,
        freq: {
          type: "string",
          enum: ["weekly", "monthly", "yearly"],
          description: "Tekrar sıklığı.",
        },
        dayOf: {
          type: "integer",
          description:
            "Dönem içindeki gün: weekly ise hafta günü (1=Pazartesi…7=Pazar), monthly/yearly ise ayın günü (1-31).",
        },
        monthOf: {
          type: "integer",
          description: "Yalnızca yearly için: hangi ay (1-12).",
        },
        categoryName: { type: "string" },
        // Şemada `account_id ... not null`: hesap zorunlu.
        accountName: { type: "string", description: "Hesap adı. ZORUNLU." },
      },
      required: ["name", "kind", "amountKurus", "freq", "dayOf", "accountName"],
    },
  },
  {
    type: "function",
    name: "updateRecurringRule",
    description: "Var olan düzenli ödeme kuralını günceller.",
    parameters: {
      type: "object",
      properties: {
        id: ID("Kural"),
        name: { type: "string" },
        amountKurus: AMOUNT,
        dayOf: { type: "integer", description: "Dönem içindeki gün (1-31)." },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "deleteRecurringRule",
    description: "Düzenli ödeme kuralını siler.",
    parameters: {
      type: "object",
      properties: { id: ID("Kural") },
      required: ["id"],
    },
  },

  // ─────────────────────── Yazma: borç ───────────────────────
  {
    type: "function",
    name: "createDebt",
    description: "Yeni bir borç veya alacak kaydı oluşturur.",
    parameters: {
      type: "object",
      properties: {
        counterparty: { type: "string", description: "Kime/kimden — kişi veya kurum adı." },
        direction: {
          type: "string",
          // Veritabanındaki `debt_direction` enum'ının BİREBİR değerleri
          // (0008_debts.sql). Başka bir adlandırma uydurmak, hook'un
          // kabul etmeyeceği bir niyet üretirdi.
          enum: ["payable", "receivable"],
          description: "'payable' = ben borçluyum, 'receivable' = bana borçlu.",
        },
        amountKurus: AMOUNT,
        dueDate: DATE,
      },
      required: ["counterparty", "direction", "amountKurus"],
    },
  },
  {
    type: "function",
    name: "updateDebt",
    description: "Var olan borç kaydını günceller.",
    parameters: {
      type: "object",
      properties: {
        id: ID("Borç"),
        counterparty: { type: "string" },
        amountKurus: AMOUNT,
        dueDate: DATE,
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "addDebtPayment",
    description: "Bir borca ödeme ekler (kısmi ödeme olabilir).",
    parameters: {
      type: "object",
      properties: {
        debtId: ID("Borç"),
        amountKurus: AMOUNT,
        date: DATE,
      },
      required: ["debtId", "amountKurus"],
    },
  },
] as const;

export const TOOL_NAMES: readonly string[] = TOOLS.map((t) => t.name);

export type ToolName = (typeof TOOLS)[number]["name"];

/**
 * Onay kartı GEREKTİREN araçlar.
 *
 * Faz 4 onay kararını yalnızca bu listeye bakarak verir. Okuma aracı
 * buraya girerse kullanıcı bakiyesini sormak için bile onay vermek
 * zorunda kalır; yazma aracı buradan çıkarsa asistan sormadan veri
 * değiştirir — ikincisi çok daha kötü.
 */
export const WRITE_TOOLS: readonly string[] = [
  "createTransaction",
  "updateTransaction",
  "deleteTransaction",
  "createAccount",
  "updateAccount",
  "archiveAccount",
  "createCategory",
  "updateCategory",
  "setBudget",
  "deleteBudget",
  "createRecurringRule",
  "updateRecurringRule",
  "deleteRecurringRule",
  "createDebt",
  "updateDebt",
  "addDebtPayment",
];

export function isToolName(value: unknown): boolean {
  return typeof value === "string" && TOOL_NAMES.includes(value);
}

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.includes(name);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/assistant/tools.test.ts`
Expected: PASS (11 test)

- [x] **Step 5: Commit**

```bash
git add src/features/assistant/tools.ts src/features/assistant/tools.test.ts
git commit -m "feat: asistan araç tanımları"
```

---

## Task 2: Niyet doğrulaması

**Files:**
- Create: `src/features/assistant/intent.ts`
- Test: `src/features/assistant/intent.test.ts`

**Interfaces:**
- Consumes: `isToolName`, `isWriteTool` (Task 1)
- Produces: `parseIntent(raw: unknown): IntentResult`, `Intent`, `MAX_BATCH`

- [x] **Step 1: Write the failing test**

Create `src/features/assistant/intent.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { parseIntent, MAX_BATCH } from "./intent";

/**
 * Niyet doğrulaması — GÜVENLİK SINIRI.
 *
 * ── NEDEN GEMINI'YE GÜVENİLMEZ ──
 *
 * Gemini'nin döndürdüğü nesne kullanıcı girdisi kadar güvenilmezdir.
 * Model uydurabilir: tanımsız araç adı, eksik zorunlu alan, string
 * gelen sayı, 400 kayıtlık silme listesi. Hepsi gerçekten oluyor.
 *
 * Bu modül tek kapı: buradan geçmeyen hiçbir şey Faz 4'teki mutation
 * hook'larına ulaşmaz. Testlerin çoğu KÖTÜ girdi üzerine kurulu,
 * çünkü iyi girdi zaten çalışıyor.
 */

const ok = { name: "getBalances", arguments: {} };

describe("parseIntent -- geçerli niyet", () => {
  test("okuma aracı kabul edilir ve onay gerektirmez", () => {
    const r = parseIntent(ok);
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.intent.name).toBe("getBalances");
    expect(r.intent.needsConfirm).toBe(false);
  });

  test("yazma aracı onay gerektirir", () => {
    const r = parseIntent({
      name: "createTransaction",
      arguments: { kind: "expense", amountKurus: 30000, date: "2026-09-21" },
    });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.intent.needsConfirm).toBe(true);
    expect(r.intent.args.amountKurus).toBe(30000);
  });
});

describe("parseIntent -- ★ bozuk girdi REDDEDİLİR", () => {
  test("tanımsız araç adı reddedilir", () => {
    const r = parseIntent({ name: "dropAllTables", arguments: {} });
    expect(r.valid).toBe(false);
    if (r.valid) return;
    expect(r.error).toMatch(/tanımadım|anlayamadım/i);
  });

  test("araç adı yoksa reddedilir", () => {
    expect(parseIntent({ arguments: {} }).valid).toBe(false);
  });

  test("null ve ilkel değerler reddedilir", () => {
    for (const bad of [null, undefined, 42, "getBalances", true, []]) {
      expect(parseIntent(bad).valid, `${JSON.stringify(bad)} kabul edildi`).toBe(false);
    }
  });

  test("arguments nesne değilse reddedilir", () => {
    expect(parseIntent({ name: "getBalances", arguments: "hepsi" }).valid).toBe(false);
    expect(parseIntent({ name: "getBalances", arguments: 5 }).valid).toBe(false);
  });

  /** `arguments` hiç gelmezse boş nesne sayılır: parametresiz araçlar var. */
  test("arguments eksikse boş kabul edilir", () => {
    const r = parseIntent({ name: "getBalances" });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.intent.args).toEqual({});
  });

  /**
   * ── TUTAR TUZAĞI ──
   *
   * Model tutarı bazen string ("30000"), bazen kesirli (300.5)
   * döndürüyor. Kuruş TAM SAYI olmak zorunda: 300.5 kuruş diye bir
   * şey yok ve float para bu projede yasak.
   */
  test("kesirli tutar reddedilir", () => {
    const r = parseIntent({
      name: "createTransaction",
      arguments: { kind: "expense", amountKurus: 300.5, date: "2026-09-21" },
    });
    expect(r.valid).toBe(false);
    if (r.valid) return;
    expect(r.error).toMatch(/tutar/i);
  });

  test("string tutar reddedilir", () => {
    expect(
      parseIntent({
        name: "createTransaction",
        arguments: { kind: "expense", amountKurus: "30000", date: "2026-09-21" },
      }).valid,
    ).toBe(false);
  });

  test("sıfır ve negatif tutar reddedilir", () => {
    for (const amountKurus of [0, -100]) {
      expect(
        parseIntent({
          name: "createTransaction",
          arguments: { kind: "expense", amountKurus, date: "2026-09-21" },
        }).valid,
        `${amountKurus} kabul edildi`,
      ).toBe(false);
    }
  });

  /**
   * ── AÇILIŞ BAKİYESİ İSTİSNASI ──
   *
   * Kredi kartı hesabı NEGATİF açılış bakiyesiyle başlar (borç) ve
   * şemada `opening_kurus`'ta `> 0` kısıtı yoktur. Genel "tutar
   * pozitif olmalı" kuralı buraya uygulanırsa kullanıcı kredi
   * kartını asistan üzerinden hiç ekleyemez.
   */
  test("★ açılış bakiyesi NEGATİF olabilir", () => {
    const r = parseIntent({
      name: "createAccount",
      arguments: { name: "Kart", kind: "credit_card", openingKurus: -250000 },
    });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.intent.args.openingKurus).toBe(-250000);
  });

  test("açılış bakiyesi yine de tam sayı olmalı", () => {
    expect(
      parseIntent({
        name: "createAccount",
        arguments: { name: "Kart", kind: "credit_card", openingKurus: -250.75 },
      }).valid,
    ).toBe(false);
  });

  test("bozuk tarih reddedilir", () => {
    for (const date of ["21-09-2026", "2026/09/21", "yarın", "2026-13-45"]) {
      const r = parseIntent({
        name: "createTransaction",
        arguments: { kind: "expense", amountKurus: 100, date },
      });
      expect(r.valid, `"${date}" kabul edildi`).toBe(false);
    }
  });

  test("tanımsız kind reddedilir", () => {
    expect(
      parseIntent({
        name: "createTransaction",
        arguments: { kind: "maas", amountKurus: 100, date: "2026-09-21" },
      }).valid,
    ).toBe(false);
  });

  test("zorunlu alan eksikse reddedilir", () => {
    // createTransaction: kind, amountKurus, date zorunlu.
    const r = parseIntent({
      name: "createTransaction",
      arguments: { kind: "expense" },
    });
    expect(r.valid).toBe(false);
    if (r.valid) return;
    expect(r.error).toMatch(/eksik/i);
  });

  test("id zorunlu olan araçta id yoksa reddedilir", () => {
    expect(parseIntent({ name: "archiveAccount", arguments: {} }).valid).toBe(false);
    expect(parseIntent({ name: "updateTransaction", arguments: { note: "x" } }).valid).toBe(
      false,
    );
  });

  test("boş string id reddedilir", () => {
    expect(parseIntent({ name: "archiveAccount", arguments: { id: "   " } }).valid).toBe(
      false,
    );
  });
});

describe("parseIntent -- ★ toplu işlem sınırı", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

  test("sınır içindeki silme kabul edilir", () => {
    const r = parseIntent({ name: "deleteTransaction", arguments: { ids: ids(MAX_BATCH) } });
    expect(r.valid).toBe(true);
  });

  /**
   * Gemini "geçen ay" yerine "geçen yıl" anlarsa 400 kayıtlık silme
   * niyeti üretebilir. 400 satırlık onay kartı okunmaz; kullanıcı
   * körlemesine onaylar ve koruma ortadan kalkar. Sınır tam bu
   * senaryo için var.
   */
  test("sınır aşılırsa reddedilir ve sayı mesajda geçer", () => {
    const r = parseIntent({
      name: "deleteTransaction",
      arguments: { ids: ids(MAX_BATCH + 1) },
    });
    expect(r.valid).toBe(false);
    if (r.valid) return;
    expect(r.error).toContain(String(MAX_BATCH + 1));
    expect(r.error).toMatch(/daralt|geniş/i);
  });

  test("boş ids reddedilir", () => {
    expect(parseIntent({ name: "deleteTransaction", arguments: { ids: [] } }).valid).toBe(
      false,
    );
  });

  test("ids dizi değilse reddedilir", () => {
    expect(parseIntent({ name: "deleteTransaction", arguments: { ids: "hepsi" } }).valid).toBe(
      false,
    );
  });

  test("ids içinde string olmayan varsa reddedilir", () => {
    expect(
      parseIntent({ name: "deleteTransaction", arguments: { ids: ["a", 5] } }).valid,
    ).toBe(false);
  });
});

describe("parseIntent -- bilinmeyen argüman ELENİR", () => {
  /**
   * Model şemada olmayan bir alan uydurursa (örn. `userId`) o alan
   * sessizce ATILIR, istek reddedilmez. Reddetmek kullanıcıyı
   * modelin fazlalığı yüzünden cezalandırırdı; geçirmek ise
   * beklenmeyen alanın hook'a sızması demek olurdu.
   */
  test("şemada olmayan alan atılır", () => {
    const r = parseIntent({
      name: "createTransaction",
      arguments: {
        kind: "expense",
        amountKurus: 100,
        date: "2026-09-21",
        userId: "baskasinin-id-si",
        isAdmin: true,
      },
    });
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.intent.args).not.toHaveProperty("userId");
    expect(r.intent.args).not.toHaveProperty("isAdmin");
    expect(r.intent.args.kind).toBe("expense");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/assistant/intent.test.ts`
Expected: FAIL — `Cannot find module './intent'`

- [x] **Step 3: Write the validator**

Create `src/features/assistant/intent.ts`:

```typescript
import { TOOLS, isToolName, isWriteTool, type ToolDefinition } from "./tools";

/**
 * Gemini'nin ürettiği niyetin DOĞRULANMASI.
 *
 * ── BU MODÜL BİR GÜVENLİK SINIRI ──
 *
 * Model çıktısı kullanıcı girdisi kadar güvenilmezdir. Buradan
 * geçmeyen hiçbir şey mutation hook'larına ulaşmaz. Reddetme
 * sebebi TÜRKÇE döner; kullanıcı "asistan çalışmıyor" değil
 * "bunu anlayamadım, şöyle söyle" görmeli.
 */

/** Tek onayda işlenebilecek en fazla kayıt. */
export const MAX_BATCH = 20;

export interface Intent {
  name: string;
  args: Record<string, unknown>;
  /** Yazma aracıysa true — Faz 4 onay kartını buna göre gösterir. */
  needsConfirm: boolean;
}

export type IntentResult =
  | { valid: true; intent: Intent }
  | { valid: false; error: string };

const fail = (error: string): IntentResult => ({ valid: false, error });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' hem biçim hem GERÇEK tarih olmalı: 2026-13-45 geçmez. */
function isValidDate(v: unknown): boolean {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  // Ayın gün sayısı: 0. gün bir sonraki ayın "sıfırıncı" günü = son gün.
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Kuruş: pozitif TAM SAYI. Float para bu projede yasak. */
function isAmount(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/** Tam sayı, işaret serbest. */
function isSignedAmount(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v);
}

/**
 * Negatif olabilen kuruş alanları.
 *
 * Kural olarak her `*Kurus` alanı pozitif olmalı — bir işlem tutarı
 * sıfır ya da eksi olamaz. Tek istisna açılış bakiyesi: kredi
 * kartında NEGATİF başlar (borç) ve şemada da `> 0` kısıtı yoktur
 * (0001_schema.sql). Bu listede olmayan her `*Kurus` alanı pozitif
 * sayılır.
 */
const SIGNED_AMOUNT_KEYS: readonly string[] = ["openingKurus"];

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function toolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

/**
 * Tek bir argümanı şemasına göre doğrular.
 *
 * @returns Türkçe hata mesajı, ya da geçerliyse null.
 */
function checkArg(key: string, value: unknown, schema: Record<string, unknown>): string | null {
  const type = schema.type as string;

  if (key.endsWith("Kurus")) {
    if (SIGNED_AMOUNT_KEYS.includes(key)) {
      return isSignedAmount(value)
        ? null
        : "Açılış bakiyesini anlayamadım. Kuruş cinsinden tam bir sayı olmalı.";
    }
    return isAmount(value)
      ? null
      : "Tutarı anlayamadım. Kuruş cinsinden tam bir sayı olmalı.";
  }

  if (key === "date" || key === "from" || key === "to" || key === "dueDate") {
    return isValidDate(value) ? null : `Tarihi anlayamadım: "${String(value)}".`;
  }

  if (key === "month") {
    return typeof value === "string" && MONTH_RE.test(value)
      ? null
      : "Ayı anlayamadım. 'YYYY-MM' biçiminde olmalı.";
  }

  if (Array.isArray(schema.enum)) {
    return (schema.enum as unknown[]).includes(value)
      ? null
      : `"${String(value)}" burada geçerli bir seçenek değil.`;
  }

  if (type === "array") {
    if (!Array.isArray(value)) return `${key} bir liste olmalı.`;
    if (value.length === 0) return "Liste boş geldi, ne yapacağımı anlayamadım.";
    if (value.length > MAX_BATCH) {
      return `${value.length} kayıt eşleşti, bu çok geniş görünüyor — daraltabilir misin?`;
    }
    if (!value.every((x) => isNonEmptyString(x))) return `${key} yalnızca metin içermeli.`;
    return null;
  }

  if (type === "integer") {
    return typeof value === "number" && Number.isInteger(value)
      ? null
      : `${key} tam sayı olmalı.`;
  }

  if (type === "string") {
    return isNonEmptyString(value) ? null : `${key} boş geldi.`;
  }

  return null;
}

/**
 * Ham model çıktısını doğrulanmış niyete çevirir.
 *
 * Şemada olmayan alanlar SESSİZCE ATILIR: modelin uydurduğu bir
 * fazlalık yüzünden isteği reddetmek kullanıcıyı cezalandırırdı,
 * ama o alanı geçirmek de hook'a sızmasına yol açardı.
 */
export function parseIntent(raw: unknown): IntentResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return fail("Ne yapmak istediğini anlayamadım, tekrar söyler misin?");
  }

  const obj = raw as Record<string, unknown>;

  if (!isToolName(obj.name)) {
    return fail("Bu isteği tanımadım, başka şekilde anlatır mısın?");
  }
  const name = obj.name as string;

  const rawArgs = obj.arguments ?? {};
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return fail("İsteğin ayrıntılarını anlayamadım, tekrar söyler misin?");
  }

  const tool = toolByName(name);
  if (!tool) return fail("Bu isteği tanımadım, başka şekilde anlatır mısın?");

  const incoming = rawArgs as Record<string, unknown>;
  const args: Record<string, unknown> = {};

  // Yalnızca ŞEMADA TANIMLI alanlar geçer.
  for (const [key, schema] of Object.entries(tool.parameters.properties)) {
    if (!(key in incoming)) continue;
    const value = incoming[key];
    if (value === null || value === undefined) continue;

    const err = checkArg(key, value, schema as Record<string, unknown>);
    if (err) return fail(err);
    args[key] = value;
  }

  for (const req of tool.parameters.required ?? []) {
    if (!(req in args)) {
      return fail("İstekte eksik bilgi var, biraz daha ayrıntı verir misin?");
    }
  }

  return { valid: true, intent: { name, args, needsConfirm: isWriteTool(name) } };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/assistant/intent.test.ts`
Expected: PASS

Bir test kırmızı kalırsa: hata mesajı hangi beklentinin karşılanmadığını söyler. `checkArg` içindeki sıra önemli — `key.endsWith("Kurus")` kontrolü `enum` kontrolünden ÖNCE gelmeli, yoksa tutar alanı yanlış dalda doğrulanır.

- [x] **Step 5: Commit**

```bash
git add src/features/assistant/intent.ts src/features/assistant/intent.test.ts
git commit -m "feat: niyet doğrulaması ve toplu işlem sınırı"
```

---

## Task 3: Model zinciri kararı

**Files:**
- Create: `src/features/assistant/models.ts`
- Test: `src/features/assistant/models.test.ts`

**Interfaces:**
- Produces: `MODEL_CHAIN`, `shouldFallback(status: number): boolean`

- [x] **Step 1: Write the failing test**

Create `src/features/assistant/models.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { MODEL_CHAIN, shouldFallback } from "./models";

/**
 * Model zinciri POLİTİKASI.
 *
 * Ücretsiz katmanda her Flash modelinin GÜNLÜK kotası ayrıdır.
 * Tek model ~5 istek demek; zincir toplamı ~35'e çıkarır.
 */

describe("MODEL_CHAIN", () => {
  test("spec'teki beş model, spec'teki sırada", () => {
    expect(MODEL_CHAIN).toEqual([
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
    ]);
  });

  /**
   * En cömert kotalı model SONDA olmalı. Başa alınsa zincir hiç
   * ilerlemez ve en zeki modeller hiç kullanılmaz.
   */
  test("flash-lite son çare", () => {
    expect(MODEL_CHAIN.at(-1)).toBe("gemini-3.5-flash-lite");
  });

  test("live modeli zincirde YOK", () => {
    // Live API kalıcı WebSocket ister; route handler'a uymuyor.
    expect(MODEL_CHAIN.some((m) => m.includes("live"))).toBe(false);
  });
});

describe("shouldFallback -- ★ hangi hata zinciri ilerletir", () => {
  test("429 (kota) sıradaki modele düşer", () => {
    expect(shouldFallback(429)).toBe(true);
  });

  test("5xx (geçici sunucu hatası) düşer", () => {
    for (const s of [500, 502, 503, 504]) {
      expect(shouldFallback(s), `${s} düşmedi`).toBe(true);
    }
  });

  /**
   * ── NEDEN 401/403/400 DÜŞMEZ ──
   *
   * Geçersiz anahtar veya bozuk istek HER MODELDE aynı sonucu verir.
   * Zinciri ilerletmek beş çağrıyı boşa harcar, kullanıcıyı beş kat
   * bekletir ve sonunda aynı hatayı gösterir. Daha kötüsü: gerçek
   * sebep (anahtar yanlış) son modelin hatası arkasına saklanır.
   */
  test("401/403 (anahtar) düşmez", () => {
    expect(shouldFallback(401)).toBe(false);
    expect(shouldFallback(403)).toBe(false);
  });

  test("400 (bozuk istek) düşmez", () => {
    expect(shouldFallback(400)).toBe(false);
  });

  test("404 ve 422 düşmez", () => {
    expect(shouldFallback(404)).toBe(false);
    expect(shouldFallback(422)).toBe(false);
  });

  test("200 düşmez", () => {
    expect(shouldFallback(200)).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/assistant/models.test.ts`
Expected: FAIL — `Cannot find module './models'`

- [x] **Step 3: Write the model chain**

Create `src/features/assistant/models.ts`:

```typescript
/**
 * Model zinciri.
 *
 * ── NEDEN ZİNCİR, TEK MODEL DEĞİL ──
 *
 * Ücretsiz katmanda her Flash modelinin GÜNLÜK istek kotası ayrıdır.
 * Tek modele bağlı kalmak günde ~5 istek demek — bir sohbet
 * asistanı için kullanılamaz. Kota tükendiğinde sıradakine düşmek
 * toplam kapasiteyi ~35'e çıkarır.
 *
 * Sıra zekâdan kotaya doğru: en iyi model önce denenir, en cömert
 * kotalı olan son çare.
 */
export const MODEL_CHAIN: readonly string[] = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

/**
 * Bu HTTP durumu sıradaki modeli denemeyi haklı kılar mı?
 *
 * SADECE geçici ve modele özgü hatalar:
 *   - 429: bu modelin kotası doldu, diğerinin kotası ayrı.
 *   - 5xx: Google tarafında geçici sorun.
 *
 * Kalıcı hatalar zinciri İLERLETMEZ. Geçersiz anahtar (401/403) ya
 * da bozuk istek (400) her modelde aynı sonucu verir; beş kez
 * denemek yalnızca kullanıcıyı bekletir ve gerçek sebebi gizler.
 */
export function shouldFallback(status: number): boolean {
  return status === 429 || status >= 500;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/assistant/models.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/features/assistant/models.ts src/features/assistant/models.test.ts
git commit -m "feat: model zinciri ve düşme politikası"
```

---

## Task 4: Sistem yönergesi ve bağlam özeti

**Files:**
- Create: `src/features/assistant/prompt.ts`
- Test: `src/features/assistant/prompt.test.ts`

**Interfaces:**
- Produces: `SYSTEM_INSTRUCTION`, `buildContextBlock(ctx: AssistantContext): string`, `AssistantContext`

- [x] **Step 1: Write the failing test**

Create `src/features/assistant/prompt.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { SYSTEM_INSTRUCTION, buildContextBlock } from "./prompt";

const ctx = {
  today: "2026-09-21",
  categories: [
    { name: "Market", kind: "expense" as const },
    { name: "Maaş", kind: "income" as const },
  ],
  accounts: [
    { name: "Nakit", kind: "cash" as const },
    { name: "Garanti", kind: "bank" as const },
  ],
};

describe("SYSTEM_INSTRUCTION", () => {
  test("Türkçe cevap vermesini söyler", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/Türkçe/);
  });

  /**
   * Model uydurmaya çok yatkın: hesap adı bilmiyorsa "Vakıfbank"
   * diye bir tane icat eder ve niyet doğrulamadan geçse bile
   * kullanıcının olmayan hesabına işlem yazılmaya çalışılır.
   */
  test("uydurmamasını açıkça söyler", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/uydur/i);
  });

  test("bugünün tarihine göre göreli tarih çözmesini söyler", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/bugün/i);
  });
});

describe("buildContextBlock", () => {
  test("bugünün tarihi bloğa girer", () => {
    expect(buildContextBlock(ctx)).toContain("2026-09-21");
  });

  test("kategori ve hesap ADLARI bloğa girer", () => {
    const block = buildContextBlock(ctx);
    for (const name of ["Market", "Maaş", "Nakit", "Garanti"]) {
      expect(block).toContain(name);
    }
  });

  /**
   * ── DIŞARI ÇIKAN VERİ ASGARİ ──
   *
   * Gemini'ye yalnızca ADLAR gider. Kimlikler (UUID) gitmez: modelin
   * onlara ihtiyacı yok (eşlemeyi istemci yapar) ve kimlik sızdırmak
   * gereksiz risktir. Ham işlem listesi de gitmez.
   */
  test("★ kimlik (UUID) bloğa GİRMEZ", () => {
    const withIds = {
      ...ctx,
      categories: [{ name: "Market", kind: "expense" as const }],
    };
    const block = buildContextBlock(withIds);
    expect(block).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  test("boş listelerde çökmez", () => {
    const empty = { today: "2026-09-21", categories: [], accounts: [] };
    expect(() => buildContextBlock(empty)).not.toThrow();
    expect(buildContextBlock(empty)).toContain("2026-09-21");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/assistant/prompt.test.ts`
Expected: FAIL — `Cannot find module './prompt'`

- [x] **Step 3: Write the prompt builder**

Create `src/features/assistant/prompt.ts`:

```typescript
/**
 * Sistem yönergesi ve bağlam özeti.
 *
 * ── DIŞARI ÇIKAN VERİ ASGARİ ──
 *
 * Gemini'ye yalnızca kategori/hesap ADLARI ve bugünün tarihi gider.
 * Kimlikler gitmez: modelin onlara ihtiyacı yok, eşlemeyi istemci
 * yapıyor ve gereksiz kimlik sızdırmanın hiçbir karşılığı yok.
 * Ham işlem listesi de gitmez — hem token maliyeti hem gizlilik.
 */

export interface AssistantContext {
  /** Bugünün tarihi, 'YYYY-MM-DD'. Göreli tarihleri model buna göre çözer. */
  today: string;
  categories: readonly { name: string; kind: "income" | "expense" }[];
  accounts: readonly { name: string; kind: "cash" | "bank" | "credit_card" }[];
}

export const SYSTEM_INSTRUCTION = `Sen bir kişisel finans uygulamasının asistanısın. Kullanıcı Türkçe konuşur, sen de Türkçe cevap verirsin.

Görevin: kullanıcının ne yapmak istediğini anlayıp uygun aracı çağırmak.

Kurallar:
- Bir işi yapmak için ARAÇ ÇAĞIR. Yapacağını anlatıp geçme.
- ASLA uydurma. Kullanıcının kategorileri ve hesapları aşağıda listeli; listede olmayan bir ad kullanma. Hangisini kastettiğinden emin değilsen SOR.
- Göreli tarihleri ("dün", "geçen hafta", "bu ayın başı") aşağıda verilen bugünün tarihine göre hesapla.
- Tutarları KURUŞ cinsinden tam sayı olarak ver. 12,50 TL = 1250.
- Bir kaydı güncellemek veya silmek gerekiyorsa ÖNCE findTransactions ile hangi kayıt olduğunu bul.
- Çok sayıda kayıt eşleşiyorsa işlemi yapma; kullanıcıdan daraltmasını iste.
- Emin olmadığın hiçbir alanı doldurma; eksik bırak, kullanıcı onay ekranında tamamlar.`;

export function buildContextBlock(ctx: AssistantContext): string {
  const cats = ctx.categories.length
    ? ctx.categories.map((c) => `- ${c.name} (${c.kind === "income" ? "gelir" : "gider"})`).join("\n")
    : "- (kategori yok)";

  const accs = ctx.accounts.length
    ? ctx.accounts.map((a) => `- ${a.name} (${ACCOUNT_LABELS[a.kind]})`).join("\n")
    : "- (hesap yok)";

  return `Bugünün tarihi: ${ctx.today}

Kullanıcının kategorileri:
${cats}

Kullanıcının hesapları:
${accs}`;
}

const ACCOUNT_LABELS: Record<AssistantContext["accounts"][number]["kind"], string> = {
  cash: "nakit",
  bank: "banka",
  credit_card: "kredi kartı",
};
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/assistant/prompt.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/features/assistant/prompt.ts src/features/assistant/prompt.test.ts
git commit -m "feat: sistem yönergesi ve bağlam özeti"
```

---

## Task 5: Gemini Interactions API istemcisi

**Files:**
- Create: `src/features/assistant/gemini.ts`
- Test: `src/features/assistant/gemini.test.ts`

**Interfaces:**
- Consumes: `TOOLS` (Task 1), `SYSTEM_INSTRUCTION`/`buildContextBlock` (Task 4)
- Produces: `callGemini(opts): Promise<GeminiCallResult>`, `GEMINI_ENDPOINT`

- [x] **Step 1: Write the failing test**

Create `src/features/assistant/gemini.test.ts`:

```typescript
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
  return vi.fn(async () =>
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
      steps: [
        { type: "message", content: [{ type: "text", text: "Hangi hesaptan?" }] },
      ],
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/assistant/gemini.test.ts`
Expected: FAIL — `Cannot find module './gemini'`

- [x] **Step 3: Write the client**

Create `src/features/assistant/gemini.ts`:

```typescript
import { TOOLS } from "./tools";
import { SYSTEM_INSTRUCTION, buildContextBlock, type AssistantContext } from "./prompt";

/**
 * Gemini Interactions API istemcisi.
 *
 * ── BİÇİM 2026-09-21'DE DOĞRULANDI ──
 *
 * context7 MCP ile ai.google.dev/gemini-api dokümantasyonundan:
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   başlık: x-goog-api-key
 *   gövde:  { model, store, input: [{type:"user_input",...}], tools: [...] }
 *   cevap:  { id, status, steps: [{type:"function_call", id, name, arguments}] }
 *
 * Eski `models/<model>:generateContent` + `contents[].parts[]` deseni
 * DEĞİL. `arguments` alanı NESNE, JSON string değil.
 *
 * ── SDK NEDEN YOK ──
 *
 * Tek uç nokta, tek istek biçimi. `@google/genai` paketi bunun için
 * bir bağımlılık, bir sürüm riski ve sunucu paketinde fazladan yük
 * demek. `fetch` yeterli — ve enjekte edilebildiği için test
 * edilebilir.
 */

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** Modelin talep ettiği araç çağrısı. */
export interface GeminiFunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

export type GeminiCallResult =
  | { ok: true; call: GeminiFunctionCall | null; text: string | null }
  | { ok: false; status: number };

export interface CallGeminiOptions {
  apiKey: string;
  model: string;
  message: string;
  ctx: AssistantContext;
  /** Enjekte edilir: testler gerçek ağa çıkmaz. */
  fetchFn?: typeof fetch;
}

interface InteractionStep {
  type?: string;
  name?: string;
  arguments?: unknown;
  content?: { type?: string; text?: string }[];
}

export async function callGemini(opts: CallGeminiOptions): Promise<GeminiCallResult> {
  const { apiKey, model, message, ctx, fetchFn = fetch } = opts;

  const body = {
    model,
    // Durumsuz: sunucuda oturum tutmuyoruz, her istek kendi başına.
    store: false,
    system_instruction: `${SYSTEM_INSTRUCTION}\n\n${buildContextBlock(ctx)}`,
    input: [{ type: "user_input", content: message }],
    tools: TOOLS,
  };

  let res: Response;
  try {
    res = await fetchFn(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        // Anahtar BAŞLIKTA: URL'e konsa sunucu loglarına ve
        // referer başlığına sızar.
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Ağ tamamen kopmuş. 0 "HTTP cevabı yok" anlamında.
    return { ok: false, status: 0 };
  }

  if (!res.ok) return { ok: false, status: res.status };

  let json: { steps?: InteractionStep[] };
  try {
    json = (await res.json()) as { steps?: InteractionStep[] };
  } catch {
    // 200 ama JSON değil (proxy hata sayfası vb.).
    return { ok: false, status: 0 };
  }

  const steps = Array.isArray(json.steps) ? json.steps : [];

  const fc = steps.find((s) => s.type === "function_call");
  if (fc && typeof fc.name === "string") {
    const args =
      typeof fc.arguments === "object" && fc.arguments !== null && !Array.isArray(fc.arguments)
        ? (fc.arguments as Record<string, unknown>)
        : {};
    return { ok: true, call: { name: fc.name, arguments: args }, text: null };
  }

  // Araç çağrısı yok: model soru soruyor ya da bilgi veriyor.
  const text =
    steps
      .flatMap((s) => s.content ?? [])
      .map((c) => c.text)
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .join("\n") || null;

  return { ok: true, call: null, text };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/assistant/gemini.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/features/assistant/gemini.ts src/features/assistant/gemini.test.ts
git commit -m "feat: Gemini Interactions API istemcisi"
```

---

## Task 6: Model zinciri yürütücüsü

**Files:**
- Create: `src/features/assistant/chain.ts`
- Test: `src/features/assistant/chain.test.ts`

**Interfaces:**
- Consumes: `MODEL_CHAIN`/`shouldFallback` (Task 3), `callGemini` (Task 5), `parseIntent` (Task 2)
- Produces: `runAssistant(opts): Promise<AssistantResult>`

- [x] **Step 1: Write the failing test**

Create `src/features/assistant/chain.test.ts`:

```typescript
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
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Sırayla verilen cevapları döndüren sahte fetch. */
function sequence(...responses: Response[]) {
  let i = 0;
  return vi.fn(async () => responses[i++] ?? responses.at(-1)!);
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
      json({ id: "v1", status: "completed", steps: [{ type: "message", content: [{ type: "text", text: "Hangi hesaptan?" }] }] }),
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
      json({ id: "v1", status: "requires_action", steps: [{ type: "function_call", id: "c", name: "dropTables", arguments: {} }] }),
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
      json({ id: "v1", status: "requires_action", steps: [{ type: "function_call", id: "c", name: "createTransaction", arguments: { kind: "expense", amountKurus: 12.5, date: "2026-09-21" } }] }),
    );
    const r = await runAssistant({ apiKey: "k", message: "x", ctx, fetchFn: f });

    expect(r.kind).toBe("error");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/assistant/chain.test.ts`
Expected: FAIL — `Cannot find module './chain'`

- [x] **Step 3: Write the chain runner**

Create `src/features/assistant/chain.ts`:

```typescript
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/assistant/chain.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/features/assistant/chain.ts src/features/assistant/chain.test.ts
git commit -m "feat: model zinciri yürütücüsü"
```

---

## Task 7: `/api/chat` route handler

**Files:**
- Create: `src/app/api/chat/route.ts`
- Modify: `.env.example` (GEMINI_API_KEY yorumunu aç)

**Interfaces:**
- Consumes: `runAssistant` (Task 6), `createClient` from `@/lib/supabase/server`

- [x] **Step 1: Create the route handler**

Create `src/app/api/chat/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAssistant } from "@/features/assistant/chain";
import type { AssistantContext } from "@/features/assistant/prompt";

/**
 * Asistan uç noktası.
 *
 * ── NEDEN SUNUCUDA ──
 *
 * `GEMINI_API_KEY` burada kalır. İstemciden çağrılsa anahtar
 * tarayıcıya inmek zorunda kalırdı ve herkese açık olurdu.
 *
 * ── BU UÇ NOKTA HİÇBİR ŞEY YAZMAZ ──
 *
 * Yalnızca niyet üretir. Yazma işini istemci, mevcut mutation
 * hook'ları üzerinden ve kullanıcının kendi RLS kapsamında yapar.
 * `service_role` anahtarı bu dosyaya ASLA girmez.
 *
 * ── OTURUM ZORUNLU ──
 *
 * Girişsiz istek reddedilir. Aksi halde uç nokta herkese açık bir
 * Gemini vekili olur ve kota tanımadığımız kişilerce tüketilir.
 */

/** İstek gövdesi: mesaj + istemcinin derlediği asgari bağlam. */
interface ChatRequestBody {
  message?: unknown;
  context?: unknown;
}

const MAX_MESSAGE_LENGTH = 1000;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Yapay zeka yapılandırılmamış. İşlemi elle ekleyebilirsin." },
      { status: 503 },
    );
  }

  // Oturum kontrolü — uç nokta açık bir Gemini vekiline dönüşmesin.
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getClaims();
  if (authError || !data) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "İstek okunamadı." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Mesaj boş." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: "Mesaj çok uzun, biraz kısaltır mısın?" },
      { status: 400 },
    );
  }

  const ctx = normalizeContext(body.context);

  const result = await runAssistant({ apiKey, message, ctx });

  if (result.kind === "error") {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  if (result.kind === "message") {
    return NextResponse.json({ text: result.text });
  }
  return NextResponse.json({ intent: result.intent });
}

/**
 * İstemciden gelen bağlamı temizler.
 *
 * İstemci gövdesi de güvenilmez: yalnızca beklediğimiz alanlar,
 * beklediğimiz biçimde geçer. Kimlik alanı hiç okunmaz — Gemini'ye
 * yalnızca adlar gider.
 */
function normalizeContext(raw: unknown): AssistantContext {
  const empty: AssistantContext = { today: todayInIstanbul(), categories: [], accounts: [] };
  if (typeof raw !== "object" || raw === null) return empty;

  const obj = raw as Record<string, unknown>;

  const categories = Array.isArray(obj.categories)
    ? obj.categories
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .filter((c) => typeof c.name === "string" && (c.kind === "income" || c.kind === "expense"))
        .map((c) => ({ name: c.name as string, kind: c.kind as "income" | "expense" }))
    : [];

  const accounts = Array.isArray(obj.accounts)
    ? obj.accounts
        .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
        .filter(
          (a) =>
            typeof a.name === "string" &&
            (a.kind === "cash" || a.kind === "bank" || a.kind === "credit_card"),
        )
        .map((a) => ({
          name: a.name as string,
          kind: a.kind as "cash" | "bank" | "credit_card",
        }))
    : [];

  const today =
    typeof obj.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.today)
      ? obj.today
      : todayInIstanbul();

  return { today, categories, accounts };
}

/**
 * Sunucuda bugünün tarihi — İstanbul saatiyle.
 *
 * Sunucu UTC'de çalışıyor olabilir; `toISOString()` ile tarih almak
 * gece 00:00–03:00 arası ÖNCEKİ günü verir. `en-CA` yerel ayarı
 * 'YYYY-MM-DD' üretir.
 */
function todayInIstanbul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}
```

- [x] **Step 2: Enable the env var in `.env.example`**

`.env.example` içindeki yorumlu satırı aç — anahtar adı değişmiyor, yalnızca artık kullanıldığı belli olsun:

```
# Asistan (Faz 3) - Gemini araç cagirma.
# SUNUCU tarafi degisken: NEXT_PUBLIC_ ONEKI KULLANMA, yoksa anahtar
# tarayiciya gonderilen JS paketine gomulur ve herkese acik olur.
# Anahtar: https://aistudio.google.com/apikey
GEMINI_API_KEY=
```

- [x] **Step 3: Verify types and full suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc çıktısı boş, tüm testler PASS

`getClaims()` imzası hakkında hata alırsan: `src/lib/supabase/middleware.ts` aynı çağrıyı kullanıyor, oradaki kullanımı örnek al.

- [x] **Step 4: Verify the build**

Run: `npm run build`
Expected: `✓ Compiled successfully` ve rota listesinde `/api/chat` görünür

- [x] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts .env.example
git commit -m "feat: /api/chat uç noktası"
```

---

## Task 8: Uçtan uca elle doğrulama

**Files:** yok (yalnızca doğrulama)

> **DURUM: KULLANICIYA KALDI.** Bu görev gerçek bir `GEMINI_API_KEY`
> ve tarayıcıda açılmış bir oturum gerektiriyor; ikisi de bende yok.
>
> Anahtar gerektirmeyen kapılar YERİNE GETİRİLDİ ve gerçek sunucuya
> istek atılarak doğrulandı (`next start` + curl):
>
> - Oturumsuz POST /api/chat → **401 JSON** (`{"error":"Oturum bulunamadı."}`)
> - Oturumsuz 12 ardışık istek → hepsi 401; hız sınırı bütçesi
>   tüketilmiyor ve yapılandırma durumu sızmıyor
> - Korumalı sayfa (/islemler) → hâlâ 307 /giris; /giris → 200
> - `GEMINI_API_KEY` istemci paketinde geçmiyor (`.next/static` taraması)
>
> Aşağıdaki adımlar anahtar eklendikten sonra senin yapacağın kontroller.

- [ ] **Step 1: Add your API key**

`.env.local` dosyasına ekle (bu dosya `.gitignore`'da, repoya gitmez):

```
GEMINI_API_KEY=<aistudio.google.com/apikey adresinden alınan anahtar>
```

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`

- [ ] **Step 3: Test with a real request**

Tarayıcıda uygulamaya GİRİŞ YAP (uç nokta oturum ister), sonra tarayıcı konsolunda:

```javascript
await fetch("/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    message: "bugün markete 300 lira harcadım",
    context: {
      today: "2026-09-21",
      categories: [{ name: "Market", kind: "expense" }],
      accounts: [{ name: "Nakit", kind: "cash" }],
    },
  }),
}).then((r) => r.json());
```

Beklenen: `createTransaction` niyeti, `amountKurus: 30000`, `needsConfirm: true`.

- [ ] **Step 4: Verify the guards**

- [ ] Oturumu kapat, aynı isteği at → **401** dönmeli
- [ ] `message: ""` gönder → **400** dönmeli
- [ ] `.env.local`'daki anahtarı boz, isteği at → Türkçe yapılandırma hatası dönmeli, uygulama ÇÖKMEMELİ
- [ ] `message` alanına 1001 karakter gönder → **400** dönmeli

- [ ] **Step 5: Commit any fixes**

Bu adımda bir hata bulursan düzelt ve commit et. Hata yoksa commit gerekmez.

---

## Task 9: Kod incelemesi

- [ ] **Step 1: Run the reviewers**

`code-reviewer` ve `security-reviewer` agent'larını bu dal için çalıştır. Güvenlik incelemesinin özellikle bakması gerekenler:
- `GEMINI_API_KEY` istemci paketine sızıyor mu (`NEXT_PUBLIC_` kullanımı var mı)
- `/api/chat` oturumsuz çağrılabiliyor mu
- `parseIntent` atlanabilecek bir yol var mı
- Hata mesajları Gemini'nin ham cevabını veya şema adlarını sızdırıyor mu

- [ ] **Step 2: Address CRITICAL and HIGH findings**

Her biri için düzeltmeyi test-first yap: önce hatayı gösteren test, sonra düzeltme.

- [ ] **Step 3: Run everything one last time**

Run: `npm test && npx tsc --noEmit && npm run build && npx playwright test --project=anon`
Expected: hepsi yeşil

- [ ] **Step 4: Push**

```bash
git push
```

---

## Sonraki fazlar

**Faz 4 — Sohbet paneli.** Mevcut dikte paneli sohbete dönüşür: mesaj listesi, metin kutusu, yanında mikrofon. `useSpeechRecognition` aynen korunur. `ActionCard` sohbet akışında belirir ve niyeti mevcut mutation hook'larına bağlar. Bu fazın ürettiği arayüzler hazır olacak:

- `POST /api/chat` → `{ intent }` | `{ text }` | `{ error }`
- `Intent { name, args, needsConfirm }`
- `WRITE_TOOLS` — onay kartı kararı için
- `MAX_BATCH` — toplu işlem sınırı

**Faz 5 — Okuma araçlarının bağlanması.** Okuma araçları (`getBalances`, `getSpending`, …) bu fazda yalnızca TANIMLI; sonuçları Gemini'ye geri gönderen ikinci tur (`function_result` + `call_id`) Faz 5'in işi. Gemini 3.x katı eşleşme istiyor: her `function_result` ilgili `call_id`'yi taşımak zorunda, yoksa `GenerateContent` boş cevap döner.

**Not:** Dikte parser'ının LLM yedeği (`createParser({ fallback })`) bu planın KAPSAMINDA DEĞİL. Sohbet asistanı ile dikte parser'ı ayrı yollar; parser yedeği istenirse `TransactionParser` arayüzünü uygulayan ince bir sarmalayıcı `runAssistant` üzerine yazılır.
