import type { DateStr } from "@/lib/date/types";

/**
 * Sorgu anahtarlari -- tek kaynak.
 *
 * Hiyerarsi ONEMLIDIR: TanStack Query onek eslesmesiyle gecersiz
 * kilar. `qk.transactions()` oneki tum islem sorgularini kapsar,
 * boylece bir islem eklendiginde hangi tarih araliklarinin
 * onbellekte oldugunu bilmeye gerek kalmaz.
 */
export const qk = {
  accounts: () => ["accounts"] as const,

  /*
   * Bakiyeler islemlerden TURETILIYOR (account_balances view).
   * Bu yuzden `accounts` onekinin ALTINDA DEGIL, ayri: bir islem
   * eklendiginde bakiyeler tazelenmeli ama hesap listesinin kendisi
   * (ad, tur, renk) degismedi -- onu da tazelemek gereksiz istek.
   */
  balances: () => ["balances"] as const,

  categories: () => ["categories"] as const,

  /*
   * Butceler. `budgetsMonth` bu onegin ALTINDA: bir islem
   * eklendiginde hangi aylarin onbellekte oldugunu bilmeye gerek
   * kalmadan `qk.budgets()` ile hepsi tazelenir.
   */
  budgets: () => ["budgets"] as const,
  budgetsMonth: (month: DateStr) => ["budgets", "month", month] as const,

  transactions: () => ["transactions"] as const,
  transactionsRange: (from: DateStr, to: DateStr) =>
    ["transactions", "range", from, to] as const,
  transactionsRecent: (limit: number) =>
    ["transactions", "recent", limit] as const,
} as const;
