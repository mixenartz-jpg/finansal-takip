import { formatTRY } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";

/**
 * Okuma araçlarının çalıştırılması.
 *
 * ── NEDEN ÖZET, HAM LİSTE DEĞİL ──
 *
 * Gemini'ye ham işlem listesi göndermek iki bedel getirir: token
 * maliyeti ve gereksiz veri paylaşımı. "Bu ay yemeğe ne harcadım"
 * sorusunun cevabı tek bir toplam; modelin 400 işlemi görmesine
 * gerek yok.
 *
 * ── NEDEN KİMLİK YOK ──
 *
 * Çıktıda UUID geçmiyor. Model kimliklerle bir şey yapamaz —
 * yazma yolu istemcide, kullanıcının kendi RLS kapsamında — ve
 * kimlik sızdırmanın hiçbir karşılığı yok.
 *
 * ── NEDEN SAF FONKSİYON ──
 *
 * Veri çağıran taraftan (React, TanStack Query önbelleği)
 * geliyor. Bu modül ağa ya da veritabanına DOKUNMUYOR; böylece
 * `node` ortamında, DOM ve ağ olmadan test edilebiliyor.
 */

export interface ReadAccount {
  name: string;
  kind: "cash" | "bank" | "credit_card";
  balanceKurus: Kurus;
}

export interface ReadTransaction {
  kind: "income" | "expense" | "transfer";
  amountKurus: Kurus;
  date: DateStr;
  categoryName: string | null;
  note: string | null;
}

export interface ReadBudget {
  categoryName: string;
  limitKurus: Kurus;
  spentKurus: Kurus;
}

export interface ReadDebt {
  counterparty: string;
  direction: "payable" | "receivable";
  principalKurus: Kurus;
  remainingKurus: Kurus;
}

export interface ReadToolData {
  accounts: readonly ReadAccount[];
  transactions: readonly ReadTransaction[];
  budgets: readonly ReadBudget[];
  debts: readonly ReadDebt[];
}

/** Modele gönderilen listelerin tavanı. */
const MAX_ROWS = 25;

const ACCOUNT_LABELS = { cash: "nakit", bank: "banka", credit_card: "kredi kartı" } as const;

/** Tarih aralığı filtresi — sınırlar DAHİL. */
function inRange(t: ReadTransaction, from: unknown, to: unknown): boolean {
  if (typeof from !== "string" || typeof to !== "string") return false;
  return t.date >= from && t.date <= to;
}

function sum(list: readonly Kurus[]): Kurus {
  return list.reduce((a, b) => a + b, 0) as Kurus;
}

function getBalances(d: ReadToolData): string {
  if (d.accounts.length === 0) return "Kayıtlı hesap yok.";
  const lines = d.accounts.map(
    (a) => `- ${a.name} (${ACCOUNT_LABELS[a.kind]}): ${formatTRY(a.balanceKurus)}`,
  );
  const total = sum(d.accounts.map((a) => a.balanceKurus));
  return `Hesap bakiyeleri:\n${lines.join("\n")}\nToplam: ${formatTRY(total)}`;
}

function getSpending(args: Record<string, unknown>, d: ReadToolData): string {
  const wanted = typeof args.categoryName === "string" ? args.categoryName : null;

  const rows = d.transactions.filter(
    (t) =>
      t.kind === "expense" &&
      inRange(t, args.from, args.to) &&
      (!wanted || t.categoryName === wanted),
  );

  if (rows.length === 0) return "Bu aralıkta harcama yok.";

  // Kategoriye göre topla.
  const byCategory = new Map<string, Kurus>();
  for (const t of rows) {
    const key = t.categoryName ?? "Kategorisiz";
    byCategory.set(key, ((byCategory.get(key) ?? 0) + t.amountKurus) as Kurus);
  }

  const lines = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, k]) => `- ${name}: ${formatTRY(k)}`);

  return `${args.from} – ${args.to} harcama:\n${lines.join("\n")}\nToplam: ${formatTRY(
    sum(rows.map((t) => t.amountKurus)),
  )}`;
}

function getBudgetStatus(d: ReadToolData): string {
  if (d.budgets.length === 0) return "Tanımlı bütçe yok.";
  const lines = d.budgets.map((b) => {
    const pct = b.limitKurus > 0 ? Math.round((b.spentKurus / b.limitKurus) * 100) : 0;
    return `- ${b.categoryName}: ${formatTRY(b.spentKurus)} / ${formatTRY(b.limitKurus)} (%${pct})`;
  });
  return `Bütçe durumu:\n${lines.join("\n")}`;
}

function getDebts(d: ReadToolData): string {
  if (d.debts.length === 0) return "Kayıtlı borç yok.";
  const lines = d.debts.map((x) => {
    const yon = x.direction === "payable" ? "ben borçluyum" : "bana borçlu";
    return `- ${x.counterparty} (${yon}): kalan ${formatTRY(x.remainingKurus)} / ${formatTRY(
      x.principalKurus,
    )}`;
  });
  return `Borçlar:\n${lines.join("\n")}`;
}

function findTransactions(args: Record<string, unknown>, d: ReadToolData): string {
  const wantedCat = typeof args.categoryName === "string" ? args.categoryName : null;
  const wantedNote = typeof args.note === "string" ? args.note.toLocaleLowerCase("tr") : null;

  const rows = d.transactions.filter(
    (t) =>
      inRange(t, args.from, args.to) &&
      (!wantedCat || t.categoryName === wantedCat) &&
      (!wantedNote || (t.note ?? "").toLocaleLowerCase("tr").includes(wantedNote)),
  );

  if (rows.length === 0) return "Bu aralıkta kayıt yok.";

  const shown = rows.slice(0, MAX_ROWS);
  const lines = shown.map(
    (t) =>
      `- ${t.date} ${t.kind === "income" ? "gelir" : "gider"} ${formatTRY(t.amountKurus)}` +
      `${t.categoryName ? ` · ${t.categoryName}` : ""}${t.note ? ` · ${t.note}` : ""}`,
  );

  // Kesme durumu SÖYLENİR: model "hepsi bu" sanıp yanlış toplam
  // çıkarmasın.
  const note =
    rows.length > shown.length
      ? `\n(${rows.length} kayıttan ilk ${shown.length} tanesi gösteriliyor — daraltman gerekebilir.)`
      : `\nToplam ${rows.length} kayıt.`;

  return `İşlemler:\n${lines.join("\n")}${note}`;
}

/**
 * Okuma aracını çalıştırır.
 *
 * @returns Modele gönderilecek özet metin, ya da araç bir okuma
 *          aracı değilse `null`. Yazma araçları BURADA
 *          çalıştırılmaz: onlar kullanıcı onayı ister.
 */
export function runReadTool(
  name: string,
  args: Record<string, unknown>,
  data: ReadToolData,
): string | null {
  switch (name) {
    case "getBalances":
      return getBalances(data);
    case "getSpending":
      return getSpending(args, data);
    case "getBudgetStatus":
      return getBudgetStatus(data);
    case "getDebts":
      return getDebts(data);
    case "findTransactions":
      return findTransactions(args, data);
    default:
      return null;
  }
}
