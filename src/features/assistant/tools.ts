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
 *
 * ── ENUM DEĞERLERİ ŞEMADAN ──
 *
 * Her `enum` listesi `supabase/migrations/` içindeki gerçek Postgres
 * enum'ının birebir kopyasıdır. Okunabilir diye yeni bir adlandırma
 * uydurmak ("i_owe" gibi), hiçbir hook'un kabul etmeyeceği niyetler
 * üretir — hata da ancak kullanıcı kaydetmeye çalışınca görünür.
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
        // `parseIntent` bu alanı SIGNED_AMOUNT_KEYS sayesinde
        // pozitiflik kuralından muaf tutar.
        openingKurus: {
          type: "integer",
          description: "Açılış bakiyesi, kuruş. Kredi kartında negatif olabilir (borç).",
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
];

export const TOOL_NAMES: readonly string[] = TOOLS.map((t) => t.name);

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
