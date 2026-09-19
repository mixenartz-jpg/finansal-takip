"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query/keys";
import type { DateStr } from "@/lib/date/types";
import {
  toTransaction,
  toRowInput,
  type Transaction,
  type TransactionInput,
  type TransactionRow,
} from "./types";

const TX_COLUMNS =
  "id, kind, amount_kurus, date, account_id, counter_account_id, " +
  "category_id, note, voice_transcript, source, created_at";

async function fetchRange(from: DateStr, to: DateStr): Promise<Transaction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_COLUMNS)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`İşlemler yüklenemedi: ${error.message}`);
  return (data as unknown as TransactionRow[]).map(toTransaction);
}

async function fetchRecent(limit: number): Promise<Transaction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_COLUMNS)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`İşlemler yüklenemedi: ${error.message}`);
  return (data as unknown as TransactionRow[]).map(toTransaction);
}

export function useTransactionsRange(from: DateStr, to: DateStr) {
  return useQuery({
    queryKey: qk.transactionsRange(from, to),
    queryFn: () => fetchRange(from, to),
  });
}

export function useRecentTransactions(limit = 50) {
  return useQuery({
    queryKey: qk.transactionsRecent(limit),
    queryFn: () => fetchRecent(limit),
  });
}

/**
 * İşlem oluşturur.
 *
 * ── GEÇERSİZ KILMA KAPSAMI ──
 *
 * `qk.transactions()` öneki TÜM işlem sorgularını (aralık + son
 * işlemler) kapsar. Hangi aralıkların önbellekte olduğunu bilmeye
 * gerek yok — önek eşleşmesi hepsini bulur.
 *
 * `qk.balances()` de geçersiz kılınır: bakiye view'dan türetiliyor
 * ve yeni işlem onu değiştirdi. Bu satır unutulsaydı kullanıcı
 * "200 TL harcadım ama bakiye değişmedi" görürdü.
 */
export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TransactionInput) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("transactions")
        .insert(toRowInput(input))
        .select(TX_COLUMNS)
        .single();

      if (error) throw new Error(translateDbError(error.message));
      return toTransaction(data as unknown as TransactionRow);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.transactions() });
      void qc.invalidateQueries({ queryKey: qk.balances() });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw new Error(`İşlem silinemedi: ${error.message}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.transactions() });
      void qc.invalidateQueries({ queryKey: qk.balances() });
    },
  });
}

/**
 * Veritabanı kısıt hatalarını kullanıcı diline çevirir.
 *
 * Ham Postgres mesajı ("new row violates check constraint
 * transfer_shape") kullanıcıya hiçbir şey anlatmaz ve şema
 * ayrıntısını sızdırır.
 */
function translateDbError(message: string): string {
  if (message.includes("transfer_shape")) {
    return "Transfer için hedef hesap seçilmeli ve kategori boş olmalı.";
  }
  if (message.includes("amount_kurus")) {
    return "Tutar sıfırdan büyük olmalı.";
  }
  if (message.includes("Kategori türü")) {
    return "Seçilen kategori işlem türüyle uyuşmuyor.";
  }
  if (message.includes("same_owner")) {
    return "Seçilen hesap veya kategori bulunamadı.";
  }
  return `İşlem kaydedilemedi: ${message}`;
}
