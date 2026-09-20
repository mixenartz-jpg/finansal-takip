# Elle Düzenleme ve Koyu Tema — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sitedeki her verinin elle düzenlenebilmesi (Faz 1) ve koyu tema desteği (Faz 2) — sohbet asistanının üzerine bineceği temel.

**Architecture:** Mevcut "tek yazma kapısı" desenini izler: her mutation `features/*/queries.ts` içinde yaşar, `toUserError` ile hata çevirir ve `qk.*` önekleriyle önbellek geçersiz kılar. Koyu tema bileşenlere dokunmadan, yalnızca `globals.css` token katmanına ikinci bir değer kümesi ekleyerek yapılır.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, TanStack Query v5, Supabase (@supabase/ssr), Tailwind v4, Vitest, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-09-20-chatbot-dark-tema-design.md`

## Global Constraints

- **Tek yazma kapısı:** Mutation'lar yalnızca `features/*/queries.ts` içinde. Bileşenler Supabase'i doğrudan çağırmaz.
- **`user_id` gönderilmez:** `stamp_user_id` trigger'ı damgalar. Insert gövdesine `user_id` yazmak yasak.
- **Hata çevirisi:** Her Supabase hatası `toUserError(error, "<Türkçe mesaj>")` ile sarılır.
- **Önbellek:** İşlem değişiminde `qk.transactions()` + `qk.balances()` + `qk.budgets()` birlikte geçersiz kılınır.
- **Arayüz dili Türkçe.** Tüm kullanıcıya görünen metinler Türkçe.
- **Renk sabiti yasak:** Bileşenler `var(--token)` okur; `#hex`, `rgb()` veya Tailwind renk adı (`text-red-500`) kullanılmaz.
- **Dokunma hedefi ≥ 24×24 CSS px** (WCAG 2.2 / 2.5.8).
- **Tutarlar `.tnum` sınıfı taşır** (tabular rakamlar).
- **Testler:** `npm test` (Vitest). Bir görev bitmeden tüm testler yeşil olmalı.
- **Vitest ortamı `node`** — DOM YOK, bilinçli seçim (`vitest.config.mts`). DOM gerektiren mantık dar arayüzlerle test edilir, jsdom eklenmez.
- **Testler yalnızca `.ts`** — `include: ["src/**/*.test.ts"]`. `.tsx` bileşen testi yazılmaz; görsel doğrulama Playwright'ın işi.
- **Kapsam listesi açıktır:** `vitest.config.mts` içindeki `coverage.include` bir izin listesi. Test edilebilir mantık içeren YENİ bir dosya oraya eklenmezse ölçüm dışı kalır.
- **Doğrulama fonksiyonları `types.ts` içinde yaşar** — mevcut desen (`validateTransaction`, `validateDebt`, `validateAccount` hepsi orada). `**/types.ts` kapsam ölçümünün dışındadır; bu kabul edilmiş bir denge, testler yine de yazılır. Deseni bozup ayrı dosya açma.
- **Markalı tipler yardımcıyla üretilir:** testlerde `asKurus(20_000)` ve `asDateStr("2026-09-20")` kullan — `20000 as Kurus` biçiminde tip zorlaması yazma.
- **Commit formatı:** `<type>: <açıklama>` — feat, fix, refactor, docs, test, chore.

---

## Dosya Yapısı

### Faz 1 — Elle düzenleme

| Dosya | Sorumluluk |
|---|---|
| `src/features/transactions/types.ts` (değişir) | `TransactionPatch` tipi + `validateTransactionPatch` |
| `src/features/transactions/queries.ts` (değişir) | `useUpdateTransaction` |
| `src/features/transactions/TransactionEditForm.tsx` (yeni) | İşlem düzenleme formu |
| `src/features/transactions/TransactionList.tsx` (değişir) | `onEdit` desteği |
| `src/features/accounts/queries.ts` (değişir) | `useUpdateAccount` |
| `src/features/accounts/AccountEditForm.tsx` (yeni) | Hesap düzenleme formu |
| `src/features/categories/types.ts` (değişir) | `CategoryPatch` tipi |
| `src/features/categories/queries.ts` (değişir) | `useUpdateCategory`, `useArchiveCategory` |
| `src/features/categories/CategoryEditForm.tsx` (yeni) | Kategori düzenleme formu |
| `src/app/(app)/kategoriler/page.tsx` (yeni) | Kategori yönetim sayfası |
| `src/app/(app)/hesaplar/page.tsx` (değişir) | Düzenle eylemi |
| `src/app/(app)/islemler/page.tsx` (değişir) | Düzenle eylemi |
| `src/components/AppShell.tsx` (değişir) | Kategoriler bağlantısı |

### Faz 2 — Koyu tema

| Dosya | Sorumluluk |
|---|---|
| `src/lib/ui/colors.ts` (değişir) | `DARK_TOKENS` — koyu tema OKLCH değerleri |
| `src/lib/ui/colors.contrast.test.ts` (değişir) | Her iki tema için kontrast + senkron testleri |
| `src/lib/ui/theme.ts` (yeni) | Tema tipi, okuma/yazma, `THEME_SCRIPT` |
| `src/lib/ui/theme.test.ts` (yeni) | Tema mantığı testleri |
| `src/app/globals.css` (değişir) | Koyu token blokları |
| `src/app/layout.tsx` (değişir) | Flash önleyici script |
| `src/components/ThemeToggle.tsx` (yeni) | Açık/Koyu/Sistem geçişi |

---

## FAZ 1 — Elle düzenleme

### Task 1: İşlem güncelleme mutation'ı

**Files:**
- Modify: `src/features/transactions/types.ts`
- Modify: `src/features/transactions/queries.ts`
- Test: `src/features/transactions/patch.test.ts` (yeni)

**Interfaces:**
- Consumes: `validateTransaction`, `TransactionInput`, `toUserError`, `qk`
- Produces:
  - `TransactionPatch = Pick<TransactionInput, "kind"|"amountKurus"|"date"|"accountId"|"counterAccountId"|"categoryId"|"note">`
  - `validateTransactionPatch(patch: Partial<TransactionPatch>): ValidationResult`
  - `toPatchRow(patch: TransactionPatch): Record<string, unknown>`
  - `useUpdateTransaction(): UseMutationResult<Transaction, Error, { id: string; patch: TransactionPatch }>`

- [ ] **Step 1: Write the failing test**

`src/features/transactions/patch.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { validateTransactionPatch, toPatchRow } from "./types";
import { asKurus } from "@/lib/money/money";
import { asDateStr } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";

const base = {
  kind: "expense" as const,
  amountKurus: asKurus(20_000),
  date: asDateStr("2026-09-20"),
  accountId: "acc-1",
  counterAccountId: null,
  categoryId: "cat-1",
  note: null,
};

describe("validateTransactionPatch", () => {
  test("geçerli yamayı kabul eder", () => {
    expect(validateTransactionPatch(base).valid).toBe(true);
  });

  test("sıfır tutarı reddeder", () => {
    const r = validateTransactionPatch({ ...base, amountKurus: asKurus(0) });
    expect(r.valid).toBe(false);
    expect(r.errors.amountKurus).toBe("Tutar sıfırdan büyük olmalı.");
  });

  test("transferde hedef hesap kaynakla aynı olamaz", () => {
    const r = validateTransactionPatch({
      ...base,
      kind: "transfer",
      categoryId: null,
      counterAccountId: "acc-1",
    });
    expect(r.valid).toBe(false);
    expect(r.errors.counterAccountId).toBe(
      "Hedef hesap kaynak hesaptan farklı olmalı.",
    );
  });

  test("takvimde olmayan tarihi reddeder", () => {
    // `asDateStr` bunu fırlatırdı; markalı tip ŞEKLİ korur, DEĞERİ
    // değil. Doğrulayıcının çalışma zamanı savunması test ediliyor.
    const r = validateTransactionPatch({ ...base, date: "2026-02-31" as DateStr });
    expect(r.valid).toBe(false);
  });
});

describe("toPatchRow", () => {
  test("camelCase alanları snake_case sütunlara çevirir", () => {
    expect(toPatchRow(base)).toEqual({
      kind: "expense",
      amount_kurus: 20000,
      date: "2026-09-20",
      account_id: "acc-1",
      counter_account_id: null,
      category_id: "cat-1",
      note: null,
    });
  });

  test("source ve voice_transcript'i DEĞİŞTİRMEZ", () => {
    // Bir işlemin sesle eklendiği bilgisi ve ham transkripti
    // düzenlemeyle kaybolmamalı: parser'ı geliştirmek için tutulan
    // gerçek korpus budur.
    const row = toPatchRow(base);
    expect(row).not.toHaveProperty("source");
    expect(row).not.toHaveProperty("voice_transcript");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/transactions/patch.test.ts`
Expected: FAIL — `validateTransactionPatch is not a function`

- [ ] **Step 3: Add types and helpers**

`src/features/transactions/types.ts` sonuna ekle:

```ts
/**
 * Düzenlenebilir alanlar.
 *
 * `source` ve `voiceTranscript` KASITLI OLARAK DIŞARIDA: bir işlemin
 * sesle eklendiği bilgisi ve ham transkripti geçmiş kaydıdır,
 * düzenlemeyle değişmez. Transkript ayrıca parser'ı geliştirmek için
 * tutulan gerçek korpustur — kullanıcı tutarı düzeltince silinmemeli.
 */
export type TransactionPatch = Pick<
  TransactionInput,
  "kind" | "amountKurus" | "date" | "accountId" | "counterAccountId" | "categoryId" | "note"
>;

/**
 * Yamayı doğrular.
 *
 * `validateTransaction`'ı yeniden kullanır: aynı kuralları ikinci kez
 * yazmak, biri değiştiğinde diğerinin sessizce eskimesi demektir.
 * Yamada bulunmayan alanlar (`voiceTranscript`, `source`) doğrulama
 * için gerekli olmadığından yer tutucu değerlerle beslenir.
 */
export function validateTransactionPatch(
  patch: Partial<TransactionPatch>,
): ValidationResult {
  const full = validateTransaction({
    ...patch,
    voiceTranscript: null,
    source: "manual",
  });
  return full;
}

/** Yamayı veritabanı sütun adlarına çevirir. */
export function toPatchRow(patch: TransactionPatch): Record<string, unknown> {
  return {
    kind: patch.kind,
    amount_kurus: patch.amountKurus,
    date: patch.date,
    account_id: patch.accountId,
    counter_account_id: patch.counterAccountId,
    category_id: patch.categoryId,
    note: patch.note,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/transactions/patch.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Add the mutation hook**

`src/features/transactions/queries.ts` — import satırına `toPatchRow` ve `TransactionPatch` ekle, sonra `useDeleteTransaction`'dan önce:

```ts
/**
 * İşlemi günceller.
 *
 * Geçersiz kılma kapsamı `useCreateTransaction` ile AYNI olmalı:
 * tutar veya kategori değişimi bakiyeyi ve bütçe ilerlemesini de
 * değiştirir. Biri unutulursa kullanıcı "tutarı düzelttim ama bütçe
 * çubuğu eski" görür.
 */
export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TransactionPatch }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("transactions")
        .update(toPatchRow(patch))
        .eq("id", id)
        .select(TX_COLUMNS)
        .single();

      if (error) throw toUserError(error, "İşlem güncellenemedi");
      return toTransaction(data as unknown as TransactionRow);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.transactions() });
      void qc.invalidateQueries({ queryKey: qk.balances() });
      void qc.invalidateQueries({ queryKey: qk.budgets() });
    },
  });
}
```

- [ ] **Step 6: Verify types and full suite**

Run: `npm run typecheck && npm test`
Expected: Hata yok, tüm testler PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/transactions/types.ts src/features/transactions/queries.ts src/features/transactions/patch.test.ts
git commit -m "feat: işlem güncelleme mutation'ı

Kaydedilmiş bir işlemin tutarı, tarihi, kategorisi ve hesabı
düzenlenebilir hale gelir. source ve voiceTranscript kasıtlı olarak
yamanın dışında: sesle eklenme bilgisi geçmiş kaydıdır.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: İşlem düzenleme formu

**Files:**
- Create: `src/features/transactions/TransactionEditForm.tsx`
- Modify: `src/features/transactions/TransactionList.tsx`
- Modify: `src/app/(app)/islemler/page.tsx`

**Interfaces:**
- Consumes: `TransactionPatch`, `validateTransactionPatch`, `useUpdateTransaction`, `Button`, `Field`, `Input`, `Select`, `parseTRYInput`, `formatTRY`
- Produces: `<TransactionEditForm transaction categories accounts saving onSave onCancel />` where `onSave: (patch: TransactionPatch) => void`

- [ ] **Step 1: Create the edit form**

`src/features/transactions/TransactionEditForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Transaction, TransactionKind, TransactionPatch } from "./types";
import { validateTransactionPatch } from "./types";
import type { Category } from "@/features/categories/types";
import type { Account } from "@/features/accounts/types";
import { formatTRY, parseTRYInput } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import { asDateStr } from "@/lib/date/date";
import { Button, Field, Input, Select } from "@/components/ui";

/**
 * İşlem düzenleme formu.
 *
 * DraftCard'dan AYRI tutuldu: DraftCard bir TAHMİNİ onaylatır (düşük
 * güven vurguları, ham transkript, "emin değilim" ipuçları). Burada
 * onaylanacak tahmin yok — kullanıcının kendi kaydettiği veri var.
 * İkisini tek bileşende birleştirmek, her ikisinin de anlamını
 * bulanıklaştırırdı.
 */
interface TransactionEditFormProps {
  transaction: Transaction;
  categories: readonly Category[];
  accounts: readonly Account[];
  saving: boolean;
  onSave: (patch: TransactionPatch) => void;
  onCancel: () => void;
}

export function TransactionEditForm({
  transaction,
  categories,
  accounts,
  saving,
  onSave,
  onCancel,
}: TransactionEditFormProps) {
  const [kind, setKind] = useState<TransactionKind>(transaction.kind);
  const [amountText, setAmountText] = useState(
    formatAmountForInput(transaction.amountKurus),
  );
  const [date, setDate] = useState<string>(transaction.date);
  const [accountId, setAccountId] = useState(transaction.accountId);
  const [counterAccountId, setCounterAccountId] = useState(
    transaction.counterAccountId ?? "",
  );
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? "");
  const [note, setNote] = useState(transaction.note ?? "");
  const [touched, setTouched] = useState(false);

  const amountKurus = parseTRYInput(amountText);
  const availableCategories = categories.filter((c) => c.kind === kind);

  const candidate: Partial<TransactionPatch> = {
    kind,
    amountKurus: amountKurus ?? undefined,
    date: date === "" ? undefined : (date as DateStr),
    accountId: accountId || undefined,
    counterAccountId: kind === "transfer" ? counterAccountId || null : null,
    categoryId: kind === "transfer" ? null : categoryId || null,
    note: note.trim() || null,
  };

  const validation = validateTransactionPatch(candidate);
  const err = (field: keyof TransactionPatch) =>
    touched ? (validation.errors[field] ?? null) : null;

  function handleSubmit() {
    setTouched(true);
    if (!validation.valid) return;

    onSave({
      kind,
      amountKurus: amountKurus as Kurus,
      date: asDateStr(date),
      accountId,
      counterAccountId: kind === "transfer" ? counterAccountId : null,
      categoryId: kind === "transfer" ? null : categoryId || null,
      note: note.trim() || null,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tür" htmlFor="edit-kind" error={err("kind")}>
          <Select
            id="edit-kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as TransactionKind);
              setCategoryId("");
            }}
          >
            <option value="expense">Gider</option>
            <option value="income">Gelir</option>
            <option value="transfer">Transfer</option>
          </Select>
        </Field>

        <Field label="Tutar" htmlFor="edit-amount" error={err("amountKurus")}>
          <Input
            id="edit-amount"
            inputMode="decimal"
            className="tnum"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0,00"
          />
          {amountKurus != null && (
            <p className="tnum text-[13px] text-[var(--ink-3)]">
              {formatTRY(amountKurus)}
            </p>
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tarih" htmlFor="edit-date" error={err("date")}>
          <Input
            id="edit-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>

        <Field label="Hesap" htmlFor="edit-account" error={err("accountId")}>
          <Select
            id="edit-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {kind === "transfer" ? (
        <Field label="Hedef hesap" htmlFor="edit-counter" error={err("counterAccountId")}>
          <Select
            id="edit-counter"
            value={counterAccountId}
            onChange={(e) => setCounterAccountId(e.target.value)}
          >
            <option value="">Seçin…</option>
            {accounts
              .filter((a) => a.id !== accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </Field>
      ) : (
        <Field label="Kategori" htmlFor="edit-category" error={err("categoryId")}>
          <Select
            id="edit-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Kategorisiz</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Açıklama" htmlFor="edit-note" error={err("note")}>
        <Input
          id="edit-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="İsteğe bağlı"
        />
      </Field>

      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={handleSubmit} loading={saving} full>
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}

/** Kuruşu form girdisi biçimine çevirir: 20000 → "200,00" */
function formatAmountForInput(kurus: Kurus): string {
  const lira = Math.floor(Math.abs(kurus) / 100);
  const kr = Math.abs(kurus) % 100;
  return kr === 0 ? String(lira) : `${lira},${String(kr).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Add `onEdit` to TransactionList**

`src/features/transactions/TransactionList.tsx` — üç değişiklik:

1. `TransactionListProps` arayüzüne ekle:
```ts
  onEdit?: (tx: Transaction) => void;
```

2. `TransactionList` imzasına `onEdit` ekle ve `TransactionRow`'a geçir:
```tsx
export function TransactionList({
  transactions,
  categories,
  accounts,
  loading,
  onDelete,
  onEdit,
}: TransactionListProps) {
```
ve `<TransactionRow ... onDelete={onDelete} onEdit={onEdit} />`

3. `TransactionRow` imzasına `onEdit?: (tx: Transaction) => void;` ekle ve silme düğmesinden ÖNCE:
```tsx
      {onEdit && (
        <button
          type="button"
          onClick={() => onEdit(tx)}
          aria-label={`İşlemi düzenle: ${label}`}
          className="grid size-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--ink-3)] opacity-0 transition-opacity hover:text-[var(--brand)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <PencilGlyph />
        </button>
      )}
```

4. Dosya sonuna ikon ekle:
```tsx
function PencilGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
```

- [ ] **Step 3: Wire the edit form into the transactions page**

`src/app/(app)/islemler/page.tsx` — importlara ekle:
```ts
import { useUpdateTransaction } from "@/features/transactions/queries";
import { TransactionEditForm } from "@/features/transactions/TransactionEditForm";
import type { Transaction, TransactionPatch } from "@/features/transactions/types";
```

Bileşen gövdesine ekle:
```tsx
  const updateTransaction = useUpdateTransaction();
  const [editing, setEditing] = useState<Transaction | null>(null);

  function handleSaveEdit(patch: TransactionPatch) {
    if (!editing) return;
    updateTransaction.mutate(
      { id: editing.id, patch },
      { onSuccess: () => setEditing(null) },
    );
  }
```

`<TransactionList ... />` çağrısına `onEdit={setEditing}` ekle, ve hemen ardından:
```tsx
      {editing && (
        <div className="fixed inset-0 z-(--z-sheet)">
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setEditing(null)}
            className="absolute inset-0 bg-[var(--ink)]/20"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="İşlemi düzenle"
            className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl overflow-y-auto rounded-t-[var(--r-lg)] border-t border-[var(--border)] bg-[var(--bg)] p-4 sm:inset-x-4 sm:bottom-4 sm:rounded-[var(--r-lg)] sm:border"
          >
            <TransactionEditForm
              transaction={editing}
              categories={categories.data ?? []}
              accounts={accounts.data ?? []}
              saving={updateTransaction.isPending}
              onSave={handleSaveEdit}
              onCancel={() => setEditing(null)}
            />
            {updateTransaction.error && (
              <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
                {updateTransaction.error.message}
              </p>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verify build and tests**

Run: `npm run typecheck && npm test && npm run lint`
Expected: Hata yok

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/ "src/app/(app)/islemler/page.tsx"
git commit -m "feat: işlem düzenleme formu

İşlem satırındaki kalem simgesiyle açılan alt sayfada tutar, tarih,
kategori, hesap ve açıklama düzenlenebilir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Hesap güncelleme

**Files:**
- Modify: `src/features/accounts/queries.ts`
- Create: `src/features/accounts/AccountEditForm.tsx`
- Modify: `src/app/(app)/hesaplar/page.tsx`

**Interfaces:**
- Consumes: `AccountInput`, `validateAccount`, `ACCOUNT_KIND_LABELS`, `toUserError`, `qk`
- Produces:
  - `useUpdateAccount(): UseMutationResult<Account, Error, { id: string; input: AccountInput }>`
  - `<AccountEditForm account saving onSave onCancel />` where `onSave: (input: AccountInput) => void`

- [ ] **Step 1: Add the mutation**

`src/features/accounts/queries.ts` — `useArchiveAccount`'tan önce ekle:

```ts
/**
 * Hesabı günceller.
 *
 * `opening_kurus` değişimi bakiyeyi doğrudan kaydırır (bakiye
 * `account_balances` view'ında açılış + hareketler olarak hesaplanır),
 * bu yüzden `qk.balances()` de geçersiz kılınır.
 */
export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: AccountInput }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("accounts")
        .update({
          name: input.name.trim(),
          kind: input.kind,
          opening_kurus: input.openingKurus,
          credit_limit_kurus: input.creditLimitKurus,
        })
        .eq("id", id)
        .select(ACCOUNT_COLUMNS)
        .single();

      if (error) throw toUserError(error, "Hesap güncellenemedi");
      return toAccount(data as AccountRow);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts() });
      void qc.invalidateQueries({ queryKey: qk.balances() });
    },
  });
}
```

- [ ] **Step 2: Create the account edit form**

`src/features/accounts/AccountEditForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Account, AccountInput, AccountKind } from "./types";
import { validateAccount, ACCOUNT_KIND_LABELS } from "./types";
import { formatTRY, parseTRYInput } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import { Button, Field, Input, Select } from "@/components/ui";

interface AccountEditFormProps {
  account: Account;
  saving: boolean;
  onSave: (input: AccountInput) => void;
  onCancel: () => void;
}

export function AccountEditForm({
  account,
  saving,
  onSave,
  onCancel,
}: AccountEditFormProps) {
  const [name, setName] = useState(account.name);
  const [kind, setKind] = useState<AccountKind>(account.kind);
  const [openingText, setOpeningText] = useState(
    formatAmountForInput(account.openingKurus),
  );
  const [limitText, setLimitText] = useState(
    account.creditLimitKurus != null
      ? formatAmountForInput(account.creditLimitKurus)
      : "",
  );
  const [touched, setTouched] = useState(false);

  const openingKurus = parseTRYInput(openingText);
  // Kredi limiti YALNIZCA kredi kartında anlamlı; tür değişince
  // alan gizlenir ve değer gönderilmez (şemadaki
  // credit_limit_only_on_card kısıtı).
  const creditLimitKurus =
    kind === "credit_card" && limitText.trim() !== ""
      ? parseTRYInput(limitText)
      : null;

  const candidate: Partial<AccountInput> = {
    name,
    kind,
    openingKurus: openingKurus ?? undefined,
    creditLimitKurus,
  };

  const validation = validateAccount(candidate);
  const err = (field: keyof AccountInput) =>
    touched ? (validation.errors[field] ?? null) : null;

  function handleSubmit() {
    setTouched(true);
    if (!validation.valid || openingKurus == null) return;
    onSave({
      name: name.trim(),
      kind,
      openingKurus: openingKurus as Kurus,
      creditLimitKurus,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Hesap adı" htmlFor="acc-name" error={err("name")}>
        <Input
          id="acc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label="Tür" htmlFor="acc-kind" error={err("kind")}>
        <Select
          id="acc-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as AccountKind)}
        >
          {(Object.keys(ACCOUNT_KIND_LABELS) as AccountKind[]).map((k) => (
            <option key={k} value={k}>
              {ACCOUNT_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Açılış bakiyesi"
        htmlFor="acc-opening"
        hint="Hesap açıldığındaki tutar. Değiştirmek güncel bakiyeyi kaydırır."
        error={err("openingKurus")}
      >
        <Input
          id="acc-opening"
          inputMode="decimal"
          className="tnum"
          value={openingText}
          onChange={(e) => setOpeningText(e.target.value)}
          placeholder="0,00"
        />
        {openingKurus != null && (
          <p className="tnum text-[13px] text-[var(--ink-3)]">
            {formatTRY(openingKurus)}
          </p>
        )}
      </Field>

      {kind === "credit_card" && (
        <Field label="Kredi limiti" htmlFor="acc-limit" error={err("creditLimitKurus")}>
          <Input
            id="acc-limit"
            inputMode="decimal"
            className="tnum"
            value={limitText}
            onChange={(e) => setLimitText(e.target.value)}
            placeholder="0,00"
          />
        </Field>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={handleSubmit} loading={saving} full>
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}

/** Kuruşu form girdisi biçimine çevirir: 20000 → "200,00" */
function formatAmountForInput(kurus: Kurus): string {
  const lira = Math.floor(Math.abs(kurus) / 100);
  const kr = Math.abs(kurus) % 100;
  const sign = kurus < 0 ? "-" : "";
  return kr === 0 ? `${sign}${lira}` : `${sign}${lira},${String(kr).padStart(2, "0")}`;
}
```

- [ ] **Step 3: Wire it into the accounts page**

`src/app/(app)/hesaplar/page.tsx`'i tamamen değiştir:

```tsx
"use client";

import { useState } from "react";
import {
  useAccountsWithBalances,
  useUpdateAccount,
} from "@/features/accounts/queries";
import { formatTRYCompact } from "@/lib/money/money";
import { ACCOUNT_KIND_LABELS, type Account, type AccountInput } from "@/features/accounts/types";
import { AccountEditForm } from "@/features/accounts/AccountEditForm";
import { EmptyState, Skeleton } from "@/components/ui";

export default function HesaplarPage() {
  const accounts = useAccountsWithBalances();
  const updateAccount = useUpdateAccount();
  const [editing, setEditing] = useState<Account | null>(null);

  function handleSave(input: AccountInput) {
    if (!editing) return;
    updateAccount.mutate(
      { id: editing.id, input },
      { onSuccess: () => setEditing(null) },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1>Hesaplar</h1>

      {accounts.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : accounts.data.length === 0 ? (
        <EmptyState
          title="Hesap yok"
          description="Kayıt olurken bir Nakit hesabı oluşturulur. Görünmüyorsa sayfayı yenileyin."
        />
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-[var(--r-lg)] border border-[var(--border)]">
          {accounts.data.map((a) => (
            <li key={a.id} className="group flex items-center gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--ink)]">{a.name}</p>
                <p className="text-[13px] text-[var(--ink-3)]">
                  {ACCOUNT_KIND_LABELS[a.kind]}
                </p>
              </div>
              <p
                className={`tnum shrink-0 text-sm font-medium ${
                  a.balanceKurus < 0 ? "text-[var(--expense)]" : "text-[var(--ink)]"
                }`}
              >
                {formatTRYCompact(a.balanceKurus)}
              </p>
              <button
                type="button"
                onClick={() => setEditing(a)}
                aria-label={`Hesabı düzenle: ${a.name}`}
                className="grid size-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--ink-3)] transition-colors hover:text-[var(--brand)]"
              >
                <PencilGlyph />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 z-(--z-sheet)">
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setEditing(null)}
            className="absolute inset-0 bg-[var(--ink)]/20"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Hesabı düzenle"
            className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl overflow-y-auto rounded-t-[var(--r-lg)] border-t border-[var(--border)] bg-[var(--bg)] p-4 sm:inset-x-4 sm:bottom-4 sm:rounded-[var(--r-lg)] sm:border"
          >
            <AccountEditForm
              account={editing}
              saving={updateAccount.isPending}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
            {updateAccount.error && (
              <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
                {updateAccount.error.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PencilGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run lint`
Expected: Hata yok

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/ "src/app/(app)/hesaplar/page.tsx"
git commit -m "feat: hesap düzenleme

Hesap adı, türü, açılış bakiyesi ve kredi limiti düzenlenebilir.
Kredi limiti alanı yalnızca kredi kartı türünde görünür.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Kategori güncelleme ve arşivleme

**Files:**
- Modify: `src/features/categories/types.ts`
- Modify: `src/features/categories/queries.ts`
- Test: `src/features/categories/patch.test.ts` (yeni)

**Interfaces:**
- Consumes: `validateCategory`, `CategoryInput`, `toUserError`, `qk`
- Produces:
  - `CategoryPatch = { name: string; kind: CategoryKind; keywords: string[] }`
  - `parseKeywords(raw: string): string[]`
  - `useUpdateCategory(): UseMutationResult<Category, Error, { id: string; patch: CategoryPatch }>`
  - `useArchiveCategory(): UseMutationResult<void, Error, string>`

- [ ] **Step 1: Write the failing test**

`src/features/categories/patch.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { parseKeywords } from "./types";

describe("parseKeywords", () => {
  test("virgülle ayrılmış kelimeleri diziye çevirir", () => {
    expect(parseKeywords("migros, bim, a101")).toEqual(["migros", "bim", "a101"]);
  });

  test("boşlukları kırpar ve boşları atar", () => {
    expect(parseKeywords("  market ,, bakkal  ,  ")).toEqual(["market", "bakkal"]);
  });

  test("parser ile AYNI normalleştirmeyi uygular", () => {
    // `normalize()` İ/I/ı harflerinin hepsini "i"ye indirger ve
    // aksanları atar. Parser eşlemeyi bununla yapıyor
    // (rule/category.ts:70), bu yüzden kayıt da bununla yapılmalı.
    expect(parseKeywords("Migros, BİM, BIM")).toEqual(["migros", "bim"]);
  });

  test("aksanları ayıklar", () => {
    expect(parseKeywords("Süt, ÇAY")).toEqual(["sut", "cay"]);
  });

  test("yinelenenleri tekilleştirir", () => {
    // "BİM" ve "BIM" normalleştirmeden SONRA aynı kelimedir;
    // tekilleştirme normalleştirmenin ardından yapılmalı.
    expect(parseKeywords("market, Market, MARKET")).toEqual(["market"]);
  });

  test("boş girdi boş dizi verir", () => {
    expect(parseKeywords("")).toEqual([]);
    expect(parseKeywords("   ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/categories/patch.test.ts`
Expected: FAIL — `parseKeywords is not a function`

- [ ] **Step 3: Add type and helper**

`src/features/categories/types.ts` — dosyanın EN ÜSTÜNE import ekle:

```ts
import { normalize } from "@/lib/text/normalize";
```

Sonra dosyanın sonuna ekle:

```ts
/** Düzenlenebilir kategori alanları. */
export interface CategoryPatch {
  name: string;
  kind: CategoryKind;
  keywords: string[];
}

/**
 * Kullanıcının yazdığı virgüllü listeyi anahtar kelime dizisine çevirir.
 *
 * ── PARSER İLE AYNI NORMALLEŞTİRME ──
 *
 * `normalize()` kullanmak ŞART, düz `toLowerCase()` değil. Parser
 * eşlemeyi `normalize(kw)` üzerinden yapıyor
 * (`rule/category.ts:70`); burada başka bir dönüşüm uygulanırsa
 * kullanıcının eklediği kelime HİÇ eşleşmez ve nedeni görünmez olur.
 *
 * Örnek: `toLocaleLowerCase("tr-TR")` "BIM" → "bım" verir, ama
 * parser "bim" arar. Kullanıcı kelimeyi ekler, çalışmaz, sebebini
 * anlayamaz.
 *
 * Tekilleştirme normalleştirmeden SONRA yapılır: "BİM" ve "BIM"
 * normalleştikten sonra aynı kelimedir.
 */
export function parseKeywords(raw: string): string[] {
  const parts = raw
    .split(",")
    .map((s) => normalize(s.trim()))
    .filter((s) => s.length > 0);
  return [...new Set(parts)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/categories/patch.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Add the mutations**

`src/features/categories/queries.ts` — import satırına `CategoryPatch` ekle, sonra `useUpdateCategoryKeywords`'ten sonra:

```ts
/**
 * Kategorinin adını, türünü ve anahtar kelimelerini günceller.
 *
 * Tür değişimi `check_category_kind` trigger'ı tarafından
 * REDDEDİLEBİLİR: kategoriye bağlı işlemler varsa gelir kategorisi
 * gidere çevrilemez. Hata `toUserError` ile kullanıcıya anlaşılır
 * biçimde iletilir.
 */
export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CategoryPatch }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("categories")
        .update({
          name: patch.name.trim(),
          kind: patch.kind,
          keywords: patch.keywords,
        })
        .eq("id", id)
        .select(CATEGORY_COLUMNS)
        .single();

      if (error) throw toUserError(error, "Kategori güncellenemedi");
      return toCategory(data as CategoryRow);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.categories() });
    },
  });
}

/**
 * Kategoriyi arşivler.
 *
 * Silmek DEĞİL arşivlemek: geçmiş işlemler kategoriye bağlı kalır ve
 * silme `on delete restrict` ile zaten reddedilirdi. Arşivlenen
 * kategori listelerden düşer ama eski raporlar bozulmaz.
 */
export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("categories")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw toUserError(error, "Kategori arşivlenemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.categories() });
      // Arşivlenen kategorinin bütçesi listede anlamsız kalır.
      void qc.invalidateQueries({ queryKey: qk.budgets() });
    },
  });
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: Hata yok, tüm testler PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/categories/
git commit -m "feat: kategori güncelleme ve arşivleme

Kategori adı, türü ve anahtar kelimeleri düzenlenebilir; kategori
arşivlenebilir. parseKeywords girdiyi küçük harfe çevirir çünkü
parser eşlemeyi küçük harf üzerinden yapar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Kategori yönetim sayfası

**Files:**
- Create: `src/features/categories/CategoryEditForm.tsx`
- Create: `src/app/(app)/kategoriler/page.tsx`
- Modify: `src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `CategoryPatch`, `parseKeywords`, `validateCategory`, `useCategories`, `useUpdateCategory`, `useArchiveCategory`, `useCreateCategory`
- Produces: `<CategoryEditForm category saving onSave onCancel />` where `onSave: (patch: CategoryPatch) => void`

- [ ] **Step 1: Create the category edit form**

`src/features/categories/CategoryEditForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Category, CategoryKind, CategoryPatch } from "./types";
import { validateCategory, parseKeywords } from "./types";
import { Button, Field, Input, Select } from "@/components/ui";

interface CategoryEditFormProps {
  category: Category;
  saving: boolean;
  onSave: (patch: CategoryPatch) => void;
  onCancel: () => void;
}

export function CategoryEditForm({
  category,
  saving,
  onSave,
  onCancel,
}: CategoryEditFormProps) {
  const [name, setName] = useState(category.name);
  const [kind, setKind] = useState<CategoryKind>(category.kind);
  const [keywordText, setKeywordText] = useState(category.keywords.join(", "));
  const [touched, setTouched] = useState(false);

  const keywords = parseKeywords(keywordText);
  const validation = validateCategory({ name, kind, keywords });
  const err = (field: "name" | "kind") =>
    touched ? (validation.errors[field] ?? null) : null;

  function handleSubmit() {
    setTouched(true);
    if (!validation.valid) return;
    onSave({ name: name.trim(), kind, keywords });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Kategori adı" htmlFor="cat-name" error={err("name")}>
        <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="Tür" htmlFor="cat-kind" error={err("kind")}>
        <Select
          id="cat-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as CategoryKind)}
        >
          <option value="expense">Gider</option>
          <option value="income">Gelir</option>
        </Select>
      </Field>

      {/*
        Önizleme satırı önemli: `parseKeywords` girdiyi
        normalleştiriyor ("Süt" → "sut"). Kullanıcı yazdığından
        farklı bir şeyin kaydedildiğini GÖRMELİ, yoksa kaydedip
        sonra listede başka bir şey bulmak kafa karıştırır.
      */}
      <Field
        label="Anahtar kelimeler"
        htmlFor="cat-keywords"
        hint="Virgülle ayırın. Sesli girişte bu kelimeler bu kategoriye eşlenir."
      >
        <Input
          id="cat-keywords"
          value={keywordText}
          onChange={(e) => setKeywordText(e.target.value)}
          placeholder="migros, bim, market"
        />
        {keywords.length > 0 && (
          <p className="text-[13px] text-[var(--ink-3)]">
            {keywords.length} kelime: {keywords.join(" · ")}
          </p>
        )}
      </Field>

      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={handleSubmit} loading={saving} full>
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the categories page**

`src/app/(app)/kategoriler/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  useCategories,
  useUpdateCategory,
  useArchiveCategory,
} from "@/features/categories/queries";
import type { Category, CategoryPatch } from "@/features/categories/types";
import { CategoryEditForm } from "@/features/categories/CategoryEditForm";
import { EmptyState, Skeleton, Badge } from "@/components/ui";

export default function KategorilerPage() {
  const categories = useCategories();
  const updateCategory = useUpdateCategory();
  const archiveCategory = useArchiveCategory();
  const [editing, setEditing] = useState<Category | null>(null);
  const [pendingArchive, setPendingArchive] = useState<string | null>(null);

  function handleSave(patch: CategoryPatch) {
    if (!editing) return;
    updateCategory.mutate(
      { id: editing.id, patch },
      { onSuccess: () => setEditing(null) },
    );
  }

  // Arşivleme iki dokunuş ister: tek dokunuşla kategori kaybolursa
  // kullanıcı ne olduğunu anlamaz.
  function handleArchive(id: string) {
    if (pendingArchive !== id) {
      setPendingArchive(id);
      window.setTimeout(() => setPendingArchive(null), 4000);
      return;
    }
    archiveCategory.mutate(id);
    setPendingArchive(null);
  }

  const expense = (categories.data ?? []).filter((c) => c.kind === "expense");
  const income = (categories.data ?? []).filter((c) => c.kind === "income");

  return (
    <div className="flex flex-col gap-4">
      <h1>Kategoriler</h1>

      {pendingArchive && (
        <p role="status" className="text-[13px] text-[var(--warning)]">
          Arşivlemek için tekrar dokunun.
        </p>
      )}

      {(updateCategory.error ?? archiveCategory.error) && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {(updateCategory.error ?? archiveCategory.error)!.message}
        </p>
      )}

      {categories.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (categories.data ?? []).length === 0 ? (
        <EmptyState
          title="Kategori yok"
          description="Kayıt olurken varsayılan kategoriler oluşturulur. Görünmüyorsa sayfayı yenileyin."
        />
      ) : (
        <>
          <CategorySection
            title="Gider"
            items={expense}
            onEdit={setEditing}
            onArchive={handleArchive}
          />
          <CategorySection
            title="Gelir"
            items={income}
            onEdit={setEditing}
            onArchive={handleArchive}
          />
        </>
      )}

      {editing && (
        <div className="fixed inset-0 z-(--z-sheet)">
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setEditing(null)}
            className="absolute inset-0 bg-[var(--ink)]/20"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Kategoriyi düzenle"
            className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl overflow-y-auto rounded-t-[var(--r-lg)] border-t border-[var(--border)] bg-[var(--bg)] p-4 sm:inset-x-4 sm:bottom-4 sm:rounded-[var(--r-lg)] sm:border"
          >
            <CategoryEditForm
              category={editing}
              saving={updateCategory.isPending}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CategorySection({
  title,
  items,
  onEdit,
  onArchive,
}: {
  title: string;
  items: readonly Category[];
  onEdit: (c: Category) => void;
  onArchive: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-[13px] font-medium text-[var(--ink-3)]">{title}</h2>
      <ul className="divide-y divide-[var(--border)] rounded-[var(--r-lg)] border border-[var(--border)]">
        {items.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[var(--ink)]">{c.name}</p>
              {c.keywords.length > 0 && (
                <p className="truncate text-[13px] text-[var(--ink-3)]">
                  {c.keywords.join(" · ")}
                </p>
              )}
            </div>
            {c.keywords.length > 0 && (
              <Badge>{c.keywords.length}</Badge>
            )}
            <button
              type="button"
              onClick={() => onEdit(c)}
              aria-label={`Kategoriyi düzenle: ${c.name}`}
              className="grid size-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--ink-3)] transition-colors hover:text-[var(--brand)]"
            >
              <PencilGlyph />
            </button>
            <button
              type="button"
              onClick={() => onArchive(c.id)}
              aria-label={`Kategoriyi arşivle: ${c.name}`}
              className="grid size-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--ink-3)] transition-colors hover:text-[var(--danger)]"
            >
              <ArchiveGlyph />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PencilGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ArchiveGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3h18v4H3zM5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M10 12h4" />
    </svg>
  );
}
```

Not: `Badge` bileşeninin imzasını `src/components/ui.tsx:204` satırından doğrula; `children` dışında zorunlu bir prop varsa çağrıyı ona göre düzelt.

- [ ] **Step 3: Add the nav link**

`src/components/AppShell.tsx` — `NAV` dizisinde `{ href: "/hesaplar", label: "Hesaplar" }` satırından sonra ekle:

```ts
  { href: "/kategoriler", label: "Kategori" },
```

Not: Mobil alt gezinmede artık 8 öğe var. Dar ekranda (320px) taşma olup olmadığını kontrol et; taşıyorsa alt gezinmeye `overflow-x-auto` ekle.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Expected: Hata yok

- [ ] **Step 5: Commit**

```bash
git add src/features/categories/ "src/app/(app)/kategoriler/" src/components/AppShell.tsx
git commit -m "feat: kategori yönetim sayfası

Kategoriler gelir/gider olarak listelenir; ad, tür ve anahtar
kelimeler düzenlenebilir, kategori iki dokunuşla arşivlenebilir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## FAZ 2 — Koyu tema

### Task 6: Koyu tema token'ları ve kontrast kapısı

**Files:**
- Modify: `src/lib/ui/colors.ts`
- Modify: `src/lib/ui/colors.contrast.test.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `Oklch`, `contrastRatio`, `AA_NORMAL`, `TOKENS`
- Produces: `DARK_TOKENS: Record<TokenName, Oklch>` — `TOKENS` ile AYNI anahtarlara sahip

**Kritik not:** Mevcut senkron testi her CSS değişkeninin İLK eşleşmesini arar. Koyu blok eklenince `--bg` iki kez geçer ve test sessizce yalnızca açık değeri doğrulamaya devam eder. Bu görev testi blok-farkındalıklı hale getirmeden bitmiş sayılmaz.

- [ ] **Step 1: Write the failing test**

`src/lib/ui/colors.contrast.test.ts` sonuna ekle:

```ts
import { DARK_TOKENS } from "./colors";

describe("koyu tema kontrastı -- WCAG AA", () => {
  const DARK_PAIRS: { name: string; fg: Oklch; bg: Oklch; min: number }[] = [
    { name: "başlık / zemin", fg: DARK_TOKENS.ink, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "GÖVDE metni / zemin", fg: DARK_TOKENS.ink2, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "ikincil metin / zemin", fg: DARK_TOKENS.ink3, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "gövde / yüzey", fg: DARK_TOKENS.ink2, bg: DARK_TOKENS.surface, min: AA_NORMAL },
    { name: "başlık / yüzey", fg: DARK_TOKENS.ink, bg: DARK_TOKENS.surface, min: AA_NORMAL },
    { name: "ikincil / yüzey-2", fg: DARK_TOKENS.ink3, bg: DARK_TOKENS.surface2, min: AA_NORMAL },

    { name: "marka bağlantı / zemin", fg: DARK_TOKENS.brand, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "marka mürekkep / marka yumuşak", fg: DARK_TOKENS.brandInk, bg: DARK_TOKENS.brandSoft, min: AA_NORMAL },

    { name: "GELİR tutarı / zemin", fg: DARK_TOKENS.income, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "GİDER tutarı / zemin", fg: DARK_TOKENS.expense, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "gelir / gelir yumuşak", fg: DARK_TOKENS.income, bg: DARK_TOKENS.incomeSoft, min: AA_NORMAL },
    { name: "gider / gider yumuşak", fg: DARK_TOKENS.expense, bg: DARK_TOKENS.expenseSoft, min: AA_NORMAL },
    { name: "gelir tutarı / yüzey", fg: DARK_TOKENS.income, bg: DARK_TOKENS.surface, min: AA_NORMAL },
    { name: "gider tutarı / yüzey", fg: DARK_TOKENS.expense, bg: DARK_TOKENS.surface, min: AA_NORMAL },

    { name: "UYARI / uyarı yumuşak", fg: DARK_TOKENS.warning, bg: DARK_TOKENS.warningSoft, min: AA_NORMAL },
    { name: "uyarı / zemin", fg: DARK_TOKENS.warning, bg: DARK_TOKENS.bg, min: AA_NORMAL },
    { name: "tehlike / zemin", fg: DARK_TOKENS.danger, bg: DARK_TOKENS.bg, min: AA_NORMAL },
  ];

  for (const { name, fg, bg, min } of DARK_PAIRS) {
    test(`${name} >= ${min}:1`, () => {
      const ratio = contrastRatio(fg, bg);
      expect(
        ratio,
        `koyu ${name}: ${ratio.toFixed(2)}:1 (en az ${min}:1 olmalı)`,
      ).toBeGreaterThanOrEqual(min);
    });
  }

  test("koyu zemin gerçekten koyu", () => {
    expect(DARK_TOKENS.bg.l).toBeLessThan(0.3);
  });

  test("koyu tema açık temayla AYNI token kümesine sahip", () => {
    // Bir token koyuda eksik kalırsa o yüzey açık temadaki değerini
    // korur ve koyu ekranda beyaz bir leke olarak görünür.
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(Object.keys(TOKENS).sort());
  });

  test("koyu kenarlık zeminden ayırt edilebilir", () => {
    expect(contrastRatio(DARK_TOKENS.border, DARK_TOKENS.bg)).toBeGreaterThan(1.2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/ui/colors.contrast.test.ts`
Expected: FAIL — `DARK_TOKENS` export edilmemiş

- [ ] **Step 3: Add DARK_TOKENS**

`src/lib/ui/colors.ts` — `TOKENS` tanımından sonra ekle:

```ts
/**
 * Koyu tema değerleri.
 *
 * ── TERS ÇEVİRME DEĞİL, YENİDEN HESAPLAMA ──
 *
 * Açık temanın lightness değerlerini 1'den çıkarmak ucuz görünür ama
 * yanlış sonuç verir: koyu zeminde aynı chroma cansız ve kirli
 * görünür, gelir yeşili ile gider kırmızısı birbirine yaklaşır.
 * Her değer koyu zemin için ayrı seçildi.
 *
 * ── ZEMİN SAF SİYAH DEĞİL ──
 *
 * L=0.17, saf siyah (L=0) değil. OLED'de saf siyah kaydırma sırasında
 * hayalet iz bırakır ve yüzey katmanları (surface/surface-2) siyahtan
 * ayrışamaz — kart sınırları kaybolur.
 */
export const DARK_TOKENS = {
  bg: { l: 0.17, c: 0.008, h: 265 },
  surface: { l: 0.21, c: 0.009, h: 265 },
  surface2: { l: 0.25, c: 0.01, h: 265 },
  border: { l: 0.32, c: 0.011, h: 265 },
  borderStrong: { l: 0.44, c: 0.013, h: 265 },

  ink: { l: 0.96, c: 0.003, h: 265 },
  ink2: { l: 0.86, c: 0.005, h: 265 },
  ink3: { l: 0.72, c: 0.008, h: 265 },

  brand: { l: 0.72, c: 0.14, h: 266 },
  brandHover: { l: 0.79, c: 0.13, h: 266 },
  brandSoft: { l: 0.27, c: 0.05, h: 266 },
  brandInk: { l: 0.82, c: 0.11, h: 266 },

  income: { l: 0.76, c: 0.16, h: 152 },
  incomeSoft: { l: 0.26, c: 0.05, h: 152 },
  expense: { l: 0.72, c: 0.16, h: 25 },
  expenseSoft: { l: 0.27, c: 0.06, h: 25 },

  warning: { l: 0.81, c: 0.14, h: 75 },
  warningSoft: { l: 0.28, c: 0.05, h: 75 },
  danger: { l: 0.72, c: 0.16, h: 25 },
} as const satisfies Record<TokenName, Oklch>;
```

Not: `satisfies Record<TokenName, Oklch>` bir token unutulursa derleme hatası verir.

- [ ] **Step 4: Run test — ayarla ve tekrarla**

Run: `npm test -- src/lib/ui/colors.contrast.test.ts`

Bir çift eşiğin altında kalırsa hata mesajı gerçek oranı yazar. Düzeltme yönü:
- Metin/ikon token'ı zemine karşı zayıfsa → o token'ın `l` değerini **artır**
- Yumuşak zemin üstündeki metin zayıfsa → yumuşak zeminin `l` değerini **azalt**
- `c` değerini değiştirmek kontrastı az etkiler; önce `l` ile çalış

Testler yeşile dönene kadar tekrarla.

- [ ] **Step 5: Make the CSS↔TS sync test block-aware**

`src/lib/ui/colors.contrast.test.ts` içindeki `"token senkronu"` describe bloğunu şu şekilde değiştir — mevcut `const css = readFileSync(...)` satırından sonra ekle ve regex'i bloklara göre çalıştır:

```ts
  /**
   * CSS artık İKİ token kümesi taşıyor. Basit bir regex her
   * değişkenin İLK eşleşmesini bulur ve koyu tema bloğu sessizce
   * doğrulanmadan kalır — test yeşil görünürken hiçbir şey
   * doğrulamaz. Bu yüzden bloklar önce ayrılıyor.
   */
  function extractBlock(source: string, marker: string): string {
    const start = source.indexOf(marker);
    expect(start, `"${marker}" globals.css içinde bulunamadı`).toBeGreaterThan(-1);
    const open = source.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) return source.slice(open, i);
      }
    }
    throw new Error(`"${marker}" bloğu kapanmamış`);
  }

  const lightBlock = extractBlock(css, "/* THEME:LIGHT */");
  const darkBlock = extractBlock(css, "/* THEME:DARK */");

  function expectTokenInBlock(block: string, cssVar: string, expected: Oklch) {
    const re = new RegExp(
      `${cssVar.replace(/-/g, "\\-")}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`,
    );
    const m = block.match(re);
    expect(m, `${cssVar} blokta bulunamadı`).not.toBeNull();
    expect(Number(m![1]), `${cssVar} L`).toBeCloseTo(expected.l, 3);
    expect(Number(m![2]), `${cssVar} C`).toBeCloseTo(expected.c, 3);
    expect(Number(m![3]), `${cssVar} H`).toBeCloseTo(expected.h, 1);
  }
```

Ardından mevcut `for (const [token, cssVar] of Object.entries(CSS_VAR_BY_TOKEN))` döngüsünü şununla değiştir:

```ts
  for (const [token, cssVar] of Object.entries(CSS_VAR_BY_TOKEN)) {
    const key = token as keyof typeof TOKENS;
    test(`${cssVar} AÇIK temada TS ile aynı`, () => {
      expectTokenInBlock(lightBlock, cssVar!, TOKENS[key]);
    });
    test(`${cssVar} KOYU temada TS ile aynı`, () => {
      expectTokenInBlock(darkBlock, cssVar!, DARK_TOKENS[key]);
    });
  }
```

- [ ] **Step 6: Add dark tokens to globals.css**

`src/app/globals.css` — mevcut `:root {` satırını işaretle ve koyu blokları ekle.

1. `:root {` satırının HEMEN ÜSTÜNE ekle:
```css
/* THEME:LIGHT */
```

2. `:root` bloğunun kapanış `}` işaretinden sonra, `@theme inline` bloğundan ÖNCE ekle:

```css
/*
 * ── KOYU TEMA ──
 *
 * İki blok, tek değer kümesi:
 *
 *   1. `@media (prefers-color-scheme: dark)` — sistem tercihi.
 *      `:root:not([data-theme="light"])` koşulu şart: kullanıcı
 *      açığı ELLE seçtiyse sistem tercihi onu ezmemeli.
 *   2. `:root[data-theme="dark"]` — kullanıcının elle seçimi,
 *      sistem ne derse desin.
 *
 * Değerler `colors.ts` içindeki DARK_TOKENS ile senkron tutulur;
 * `colors.contrast.test.ts` her iki bloğu ayrı ayrı doğrular.
 */

/* THEME:DARK */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: oklch(0.17 0.008 265);
    --surface: oklch(0.21 0.009 265);
    --surface-2: oklch(0.25 0.01 265);
    --border: oklch(0.32 0.011 265);
    --border-strong: oklch(0.44 0.013 265);

    --ink: oklch(0.96 0.003 265);
    --ink-2: oklch(0.86 0.005 265);
    --ink-3: oklch(0.72 0.008 265);

    --brand: oklch(0.72 0.14 266);
    --brand-hover: oklch(0.79 0.13 266);
    --brand-soft: oklch(0.27 0.05 266);
    --brand-ink: oklch(0.82 0.11 266);

    --income: oklch(0.76 0.16 152);
    --income-soft: oklch(0.26 0.05 152);
    --expense: oklch(0.72 0.16 25);
    --expense-soft: oklch(0.27 0.06 25);

    --warning: oklch(0.81 0.14 75);
    --warning-soft: oklch(0.28 0.05 75);
    --danger: oklch(0.72 0.16 25);
  }
}

:root[data-theme="dark"] {
  --bg: oklch(0.17 0.008 265);
  --surface: oklch(0.21 0.009 265);
  --surface-2: oklch(0.25 0.01 265);
  --border: oklch(0.32 0.011 265);
  --border-strong: oklch(0.44 0.013 265);

  --ink: oklch(0.96 0.003 265);
  --ink-2: oklch(0.86 0.005 265);
  --ink-3: oklch(0.72 0.008 265);

  --brand: oklch(0.72 0.14 266);
  --brand-hover: oklch(0.79 0.13 266);
  --brand-soft: oklch(0.27 0.05 266);
  --brand-ink: oklch(0.82 0.11 266);

  --income: oklch(0.76 0.16 152);
  --income-soft: oklch(0.26 0.05 152);
  --expense: oklch(0.72 0.16 25);
  --expense-soft: oklch(0.27 0.06 25);

  --warning: oklch(0.81 0.14 75);
  --warning-soft: oklch(0.28 0.05 75);
  --danger: oklch(0.72 0.16 25);
}
```

Önemli: `Step 4`'te DARK_TOKENS değerlerini ayarladıysan, buradaki CSS değerleri de AYNI olmalı — senkron testi bunu zaten yakalar.

Not: `/* THEME:DARK */` işareti `@media` bloğunun üstünde; `extractBlock` oradan sonraki ilk `{` ile başlar ve iç içe blokları sayarak `@media`'nın tamamını alır, içindeki `:root:not(...)` kuralları dahil.

- [ ] **Step 7: Run all tests**

Run: `npm test -- src/lib/ui/colors.contrast.test.ts`
Expected: PASS — hem açık hem koyu kontrast, hem de her iki blok için senkron testleri

- [ ] **Step 8: Commit**

```bash
git add src/lib/ui/colors.ts src/lib/ui/colors.contrast.test.ts src/app/globals.css
git commit -m "feat: koyu tema token'ları

Koyu tema değerleri ters çevirme değil yeniden hesaplama ile
belirlendi. Senkron testi artık açık ve koyu blokları ayrı ayrı
doğruluyor: tek regex ilk eşleşmeyi bulup koyu bloğu sessizce
atlıyordu.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Tema durumu ve flash önleyici script

**Files:**
- Create: `src/lib/ui/theme.ts`
- Create: `src/lib/ui/theme.test.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces:
  - `type Theme = "light" | "dark" | "system"`
  - `THEME_STORAGE_KEY = "hesap-takip-theme"`
  - `isTheme(value: unknown): value is Theme`
  - `resolveTheme(theme: Theme, prefersDark: boolean): "light" | "dark"`
  - `type ThemeTarget = Pick<HTMLElement, "setAttribute" | "removeAttribute">`
  - `applyTheme(theme: Theme, root: ThemeTarget): void`
  - `readStoredTheme(storage: Pick<Storage, "getItem">): Theme`
  - `THEME_SCRIPT: string`

- [ ] **Step 1: Write the failing test**

`src/lib/ui/theme.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import {
  isTheme,
  resolveTheme,
  readStoredTheme,
  applyTheme,
  THEME_STORAGE_KEY,
  THEME_SCRIPT,
} from "./theme";

describe("isTheme", () => {
  test("geçerli değerleri tanır", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(true);
  });

  test("geçersiz değerleri reddeder", () => {
    expect(isTheme("koyu")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(42)).toBe(false);
  });
});

describe("resolveTheme", () => {
  test("açık ve koyu seçimler sistem tercihini yok sayar", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("sistem seçimi tercihi izler", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("readStoredTheme", () => {
  test("kayıtlı geçerli değeri döndürür", () => {
    const storage = { getItem: () => "dark" };
    expect(readStoredTheme(storage)).toBe("dark");
  });

  test("kayıt yoksa system döner", () => {
    const storage = { getItem: () => null };
    expect(readStoredTheme(storage)).toBe("system");
  });

  test("bozuk değerde system döner", () => {
    // localStorage kullanıcı tarafından elle düzenlenebilir;
    // bozuk değer uygulamayı kırmamalı.
    const storage = { getItem: () => "{bozuk}" };
    expect(readStoredTheme(storage)).toBe("system");
  });

  test("getItem fırlatırsa system döner", () => {
    // Gizli sekmede veya site verisi engelliyken localStorage
    // erişimi istisna atar.
    const storage = {
      getItem: () => {
        throw new Error("engellendi");
      },
    };
    expect(readStoredTheme(storage)).toBe("system");
  });
});

describe("applyTheme", () => {
  /**
   * Vitest `environment: "node"` kullanıyor — DOM YOK ve bu bilinçli
   * bir seçim (bkz. vitest.config.mts). Bu yüzden `applyTheme` gerçek
   * bir HTMLElement değil, ihtiyacı olan iki metodu taşıyan sahte bir
   * nesneyle test ediliyor. jsdom kurmak tüm test takımını yavaşlatır
   * ve tek bir fonksiyon için bedeli ağır.
   */
  function fakeRoot() {
    const attrs = new Map<string, string>();
    return {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
      getAttribute: (k: string) => attrs.get(k) ?? null,
      hasAttribute: (k: string) => attrs.has(k),
    };
  }

  test("açık ve koyu için data-theme yazar", () => {
    const root = fakeRoot();
    applyTheme("dark", root);
    expect(root.getAttribute("data-theme")).toBe("dark");
    applyTheme("light", root);
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  test("system seçiminde data-theme KALDIRILIR", () => {
    // Öznitelik kalsaydı CSS'teki @media bloğu devre dışı kalır ve
    // sistem tercihi değiştiğinde sayfa tepki vermezdi.
    const root = fakeRoot();
    applyTheme("dark", root);
    applyTheme("system", root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
});

describe("THEME_SCRIPT", () => {
  test("depolama anahtarını içerir", () => {
    expect(THEME_SCRIPT).toContain(THEME_STORAGE_KEY);
  });

  test("try/catch ile sarılı", () => {
    // Script <head>'de senkron çalışır; bir istisna sayfanın geri
    // kalanının çizilmesini engellerdi.
    expect(THEME_SCRIPT).toContain("try");
    expect(THEME_SCRIPT).toContain("catch");
  });

  test("kapanış script etiketi içermez", () => {
    // dangerouslySetInnerHTML ile gömülüyor; "</script>" dizesi
    // etiketi erken kapatır ve sayfayı bozar.
    expect(THEME_SCRIPT).not.toContain("</script>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/ui/theme.test.ts`
Expected: FAIL — `./theme` modülü bulunamadı

- [ ] **Step 3: Create the theme module**

`src/lib/ui/theme.ts`:

```ts
/**
 * Tema durumu.
 *
 * ── ÜÇ DEĞER, İKİ GÖRÜNÜM ──
 *
 * Kullanıcı üç şey seçebilir (açık / koyu / sistem) ama ekranda iki
 * görünüm vardır. "system" bir görünüm DEĞİL, bir yönlendirmedir:
 * `data-theme` özniteliği kaldırılır ve CSS'teki
 * `prefers-color-scheme` bloğu devreye girer.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "hesap-takip-theme";

const THEMES: readonly string[] = ["light", "dark", "system"];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.includes(value);
}

/** Seçim + sistem tercihi → ekrandaki gerçek görünüm. */
export function resolveTheme(theme: Theme, prefersDark: boolean): "light" | "dark" {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

/**
 * Kayıtlı tercihi okur.
 *
 * `localStorage` gizli sekmede veya site verisi engellendiğinde
 * ERİŞİMDE istisna atar — okuma try/catch içinde. Bozuk değer de
 * varsayılana düşer: kullanıcı depolamayı elle düzenleyebilir.
 */
export function readStoredTheme(storage: Pick<Storage, "getItem">): Theme {
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

/**
 * `applyTheme`'in ihtiyaç duyduğu tek şey.
 *
 * `HTMLElement` yerine dar bir arayüz: testler DOM'suz node
 * ortamında çalışıyor (bkz. vitest.config.mts) ve tek bir fonksiyon
 * için jsdom kurmak tüm takımı yavaşlatırdı.
 */
export type ThemeTarget = Pick<HTMLElement, "setAttribute" | "removeAttribute">;

/**
 * Temayı köke uygular.
 *
 * "system" seçiminde öznitelik KALDIRILIR, "system" yazılmaz: CSS
 * `:root:not([data-theme="light"])` ile çalışıyor ve öznitelik kalsa
 * medya sorgusu beklendiği gibi davranmazdı.
 */
export function applyTheme(theme: Theme, root: ThemeTarget): void {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/**
 * <head>'de senkron çalışan flash önleyici script.
 *
 * ── NEDEN INLINE VE SENKRON ──
 *
 * React hidrasyonu beklenirse sayfa bir an AÇIK temada çizilir ve
 * koyu temaya geçerken beyaz parlar. Geceleyin telefonda bakan biri
 * için bu rahatsız edici. Script <head>'de, gövde çizilmeden önce
 * çalışmalı.
 *
 * Tek dize olarak tutuluyor çünkü `dangerouslySetInnerHTML` ile
 * gömülüyor; try/catch şart, çünkü burada atılan bir istisna
 * sayfanın geri kalanını durdurur.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/ui/theme.test.ts`
Expected: PASS (14 test)

- [ ] **Step 4b: Add theme.ts to the coverage scope**

`vitest.config.mts` — `coverage.include` dizisine ekle:

```ts
        "src/lib/ui/theme.ts",
```

Gerekçe: `include` açık bir liste. Eklenmezse `theme.ts` kapsam raporuna hiç girmez ve eşikler onu görmez — testleri olan bir modül sessizce ölçüm dışı kalır.

Run: `npm run test:coverage`
Expected: Eşikler (lines 80, functions 80, branches 75) korunur

- [ ] **Step 5: Add the script to the layout**

`src/app/layout.tsx`:

1. Import ekle:
```ts
import { THEME_SCRIPT } from "@/lib/ui/theme";
```

2. `viewport` dışa aktarımını değiştir — tarayıcı çubuğu temaya uysun:
```ts
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121317" },
  ],
  width: "device-width",
  initialScale: 1,
};
```

3. `RootLayout`'ta `<html>` etiketine `suppressHydrationWarning` ekle ve `<head>` içine script'i koy:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * `suppressHydrationWarning`: script sunucudan gelen HTML'e
     * `data-theme` ekler, yani istemcideki ağaç sunucununkiyle
     * kasıtlı olarak farklıdır. Bu uyarı olmasaydı React her
     * yüklemede uyumsuzluk uyarısı basardı.
     */
    <html lang="tr" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test && npm run lint`
Expected: Hata yok

- [ ] **Step 7: Commit**

```bash
git add src/lib/ui/theme.ts src/lib/ui/theme.test.ts src/app/layout.tsx
git commit -m "feat: tema durumu ve flash önleyici script

Tercih localStorage'da; <head>'de senkron çalışan script gövde
çizilmeden data-theme yazar, böylece koyu temada sayfa açılışta
beyaz parlamaz. localStorage erişimi gizli sekmede istisna
atabildiği için her okuma try/catch içinde.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Tema geçiş düğmesi

**Files:**
- Create: `src/components/ThemeToggle.tsx`
- Modify: `src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `Theme`, `readStoredTheme`, `applyTheme`, `THEME_STORAGE_KEY`
- Produces: `<ThemeToggle />` — props almaz

- [ ] **Step 1: Create the toggle**

`src/components/ThemeToggle.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  readStoredTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/ui/theme";

/**
 * Tema geçişi — Açık / Koyu / Sistem.
 *
 * ── NEDEN ÜÇ DÜĞME, AÇ/KAPA DEĞİL ──
 *
 * İki durumlu bir anahtar "sistem" seçeneğini gizler ve kullanıcı
 * telefonunu akşam koyuya alınca uygulamanın onu izlemesini
 * sağlayamaz. Üç seçenek radyo grubu olarak sunuluyor çünkü
 * gerçekten üç dışlayıcı seçenek var.
 *
 * ── MONTAJDAN ÖNCE ÇİZİLMEZ ──
 *
 * Sunucuda `localStorage` yok. İlk render'da bir seçimi işaretli
 * göstermek, istemcide başka bir seçim çıkınca hidrasyon
 * uyuşmazlığı üretir. `mounted` bayrağı bunu önler.
 */

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Açık" },
  { value: "dark", label: "Koyu" },
  { value: "system", label: "Sistem" },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme(window.localStorage));
    setMounted(true);
  }, []);

  function handleSelect(next: Theme) {
    setTheme(next);
    applyTheme(next, document.documentElement);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Gizli sekmede yazma engellenebilir. Tema yine de bu oturum
      // için uygulandı; kalıcı olmaması kabul edilebilir.
    }
  }

  if (!mounted) {
    // Yer tutucu: düğme grubu sonradan belirince başlık zıplamasın.
    return <div className="h-8 w-[132px]" aria-hidden />;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Görünüm teması"
      className="flex items-center gap-0.5 rounded-[var(--r-md)] bg-[var(--surface-2)] p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => handleSelect(opt.value)}
            className={[
              "rounded-[var(--r-sm)] px-2 py-1 text-[13px] font-medium",
              "transition-colors duration-[var(--dur-fast)]",
              active
                ? "bg-[var(--bg)] text-[var(--ink)]"
                : "text-[var(--ink-3)] hover:text-[var(--ink)]",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add it to the header**

`src/components/AppShell.tsx`:

1. Import ekle:
```ts
import { ThemeToggle } from "@/components/ThemeToggle";
```

2. Başlıktaki `<div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">` içinde, `<nav aria-label="Ana gezinme" className="hidden gap-1 sm:flex">...</nav>` bloğunu şu sarmalayıcıyla değiştir:

```tsx
          <div className="flex items-center gap-2">
            <nav aria-label="Ana gezinme" className="hidden gap-1 sm:flex">
              {NAV.map((item) => (
                <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
              ))}
            </nav>
            <ThemeToggle />
          </div>
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Expected: Hata yok

- [ ] **Step 4: Manual check in the browser**

Run: `npm run dev`

Kontrol listesi:
- [ ] Koyu seç → sayfa koyuya döner
- [ ] Sayfayı yenile → koyu kalır, açılışta BEYAZ PARLAMA OLMAZ
- [ ] Sistem seç → işletim sistemi temasını izler
- [ ] Sistem temasını değiştir → sayfa yenilemeden tepki verir
- [ ] Açık seç, sistem koyuyken → açık kalır (sistem ezmez)
- [ ] Koyu temada her sayfayı gez: Panel, İşlemler, Bütçe, Düzenli, Borç, Rapor, Hesaplar, Kategori — beyaz leke veya okunmayan metin olmamalı
- [ ] Koyu temada grafikler (`CashflowChart`, `CategoryChart`) okunabilir

Beyaz leke bulursan: o bileşende sabit renk kullanılmıştır (`bg-white`, `text-black`, `#hex`). Token'a çevir.

- [ ] **Step 5: Commit**

```bash
git add src/components/ThemeToggle.tsx src/components/AppShell.tsx
git commit -m "feat: tema geçiş düğmesi

Başlıkta Açık/Koyu/Sistem radyo grubu. Montajdan önce yer tutucu
çizilir: sunucuda localStorage olmadığı için ilk render'da bir
seçimi işaretlemek hidrasyon uyuşmazlığı üretirdi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Erişilebilirlik doğrulaması

**Files:**
- Modify: `e2e/` altındaki mevcut erişilebilirlik testi (önce `ls e2e/` ile dosya adını bul)

**Interfaces:**
- Consumes: `@axe-core/playwright`

- [ ] **Step 1: Find the existing accessibility test**

Run: `ls e2e/ && grep -rln "AxeBuilder\|axe" e2e/`

Mevcut dosyanın desenini izle. Yeni test dosyası oluşturma — mevcut olanı genişlet.

- [ ] **Step 2: Add dark theme and new pages to the axe sweep**

Mevcut axe testine iki ekleme yap:

1. Taranan sayfa listesine `/kategoriler` ekle.
2. Koyu tema için tarama ekle — mevcut testin desenine uyarak, sayfaya gitmeden önce:

```ts
  await page.addInitScript(() => {
    window.localStorage.setItem("hesap-takip-theme", "dark");
  });
```

Bu, her sayfanın koyu temada da taranmasını sağlar. Kontrast ihlalleri Task 6'daki birim testlerince zaten kapatıldı; axe burada gerçek DOM üzerinde doğrular.

- [ ] **Step 3: Run E2E**

Run: `npm run e2e`
Expected: PASS

İhlal çıkarsa: axe hangi öğeyi ve hangi kuralı belirtir. Kontrast ihlaliyse ilgili token'ı `colors.ts` içinde düzelt ve `globals.css` ile senkronla (senkron testi yakalar).

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "test: koyu tema ve kategoriler sayfası için erişilebilirlik taraması

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Kod incelemesi

- [ ] **Step 1: Run the code reviewer**

Faz 1 ve 2'de yazılan tüm kod için `code-reviewer` agent'ını çalıştır. Global kural: kod yazıldıktan sonra inceleme zorunlu.

- [ ] **Step 2: Address CRITICAL and HIGH findings**

CRITICAL bulgular birleştirmeyi ENGELLER. HIGH bulgular düzeltilmeli. MEDIUM değerlendirilir.

- [ ] **Step 3: Run the full suite one last time**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: Hepsi yeşil

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Sonraki fazlar

Faz 3–5 (sohbet asistanı) bu plandan SONRA ayrı bir planla ele alınır. Gerekçe: Gemini'nin araç-çağırma API'si `context7` MCP ile doğrulanmadan görev adımları yazılamaz — ezberden yazılan bir API imzası plan boyunca yanlış taşınır.

Faz 3–5 planı yazılırken bu planın ürettiği arayüzler hazır olacak:
- `useUpdateTransaction({ id, patch })`
- `useUpdateAccount({ id, input })`
- `useUpdateCategory({ id, patch })`, `useArchiveCategory(id)`
- Koyu temada çalışan token katmanı

Sohbet asistanının yazma araçları doğrudan bu hook'ları çağırır.
