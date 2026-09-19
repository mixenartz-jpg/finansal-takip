"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query/keys";
import { toUserError } from "@/lib/db/errors";
import type { Kurus } from "@/lib/money/types";
import {
  toAccount,
  toAccountBalance,
  type Account,
  type AccountBalance,
  type AccountInput,
  type AccountRow,
  type AccountBalanceRow,
  type AccountWithBalance,
} from "./types";

const ACCOUNT_COLUMNS =
  "id, name, kind, opening_kurus, credit_limit_kurus, color_slot, sort_order, archived_at";

async function fetchAccounts(): Promise<Account[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select(ACCOUNT_COLUMNS)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) throw toUserError(error, "Hesaplar yüklenemedi");
  return (data as AccountRow[]).map(toAccount);
}

/**
 * Bakiyeler `account_balances` view'ından okunur — hesap tablosunda
 * `balance` sütunu YOKTUR (bkz. 0004_views.sql). Her okumada
 * hareketlerden hesaplanır, bu yüzden hiçbir zaman eskimez.
 */
async function fetchBalances(): Promise<AccountBalance[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("account_balances")
    .select("account_id, balance_kurus");

  if (error) throw toUserError(error, "Bakiyeler yüklenemedi");
  return (data as AccountBalanceRow[]).map(toAccountBalance);
}

export function useAccounts() {
  return useQuery({ queryKey: qk.accounts(), queryFn: fetchAccounts });
}

export function useBalances() {
  return useQuery({ queryKey: qk.balances(), queryFn: fetchBalances });
}

/**
 * Hesaplar + bakiyeleri birleştirilmiş.
 *
 * İki ayrı sorgu olarak tutulup burada birleştiriliyor: bir işlem
 * eklendiğinde yalnızca `balances` geçersiz kılınır, hesap listesi
 * (ad, tür, renk — değişmeyen veri) yeniden çekilmez.
 */
export function useAccountsWithBalances() {
  const accounts = useAccounts();
  const balances = useBalances();

  const byId = new Map(balances.data?.map((b) => [b.accountId, b.balanceKurus]));
  const merged: AccountWithBalance[] =
    accounts.data?.map((a) => ({
      ...a,
      balanceKurus: byId.get(a.id) ?? (a.openingKurus as Kurus),
    })) ?? [];

  return {
    data: merged,
    isPending: accounts.isPending || balances.isPending,
    error: accounts.error ?? balances.error,
  };
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AccountInput) => {
      const supabase = createClient();
      // `user_id` GÖNDERİLMEZ — `stamp_user_id` trigger'ı damgalar.
      const { data, error } = await supabase
        .from("accounts")
        .insert({
          name: input.name.trim(),
          kind: input.kind,
          opening_kurus: input.openingKurus,
          credit_limit_kurus: input.creditLimitKurus,
        })
        .select(ACCOUNT_COLUMNS)
        .single();

      if (error) throw toUserError(error, "Hesap eklenemedi");
      return toAccount(data as AccountRow);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts() });
      // Açılış bakiyesi bakiyeyi de etkiler.
      void qc.invalidateQueries({ queryKey: qk.balances() });
    },
  });
}

export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // Silmek değil ARŞİVLEMEK: geçmiş işlemler hesaba bağlı kalır
      // (`on delete restrict`), silmeye çalışmak zaten reddedilirdi.
      const { error } = await supabase
        .from("accounts")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw toUserError(error, "Hesap arşivlenemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts() });
      void qc.invalidateQueries({ queryKey: qk.balances() });
    },
  });
}
