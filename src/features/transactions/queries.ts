"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query/keys";
import { toUserError } from "@/lib/db/errors";
import type { DateStr } from "@/lib/date/types";
import {
  toTransaction,
  toRowInput,
  toPatchRow,
  type Transaction,
  type TransactionInput,
  type TransactionPatch,
  type TransactionRow,
} from "./types";

const TX_COLUMNS =
  "id, kind, amount_kurus, date, account_id, counter_account_id, " +
  "category_id, note, voice_transcript, source, recurring_id, created_at";

async function fetchRange(from: DateStr, to: DateStr): Promise<Transaction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_COLUMNS)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw toUserError(error, "İşlemler yüklenemedi");
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

  if (error) throw toUserError(error, "İşlemler yüklenemedi");
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

      if (error) throw toUserError(error, "İşlem kaydedilemedi");
      return toTransaction(data as unknown as TransactionRow);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.transactions() });
      void qc.invalidateQueries({ queryKey: qk.balances() });
      // Yeni/silinen bir gider o ayin butce ilerlemesini degistirir.
      // Bu satir unutulsaydi kullanici "200 TL harcadim ama butce
      // cubugu ayni" gorurdu -- bakiye icin gecerli olan ayni tuzak.
      void qc.invalidateQueries({ queryKey: qk.budgets() });
    },
  });
}

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

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw toUserError(error, "İşlem silinemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.transactions() });
      void qc.invalidateQueries({ queryKey: qk.balances() });
      // Yeni/silinen bir gider o ayin butce ilerlemesini degistirir.
      // Bu satir unutulsaydi kullanici "200 TL harcadim ama butce
      // cubugu ayni" gorurdu -- bakiye icin gecerli olan ayni tuzak.
      void qc.invalidateQueries({ queryKey: qk.budgets() });
    },
  });
}

