"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query/keys";
import { toUserError } from "@/lib/db/errors";
import type { DateStr } from "@/lib/date/types";
import type { TransactionInput } from "@/features/transactions/types";
import {
  toRecurringRule,
  toRuleRowInput,
  type RecurringRule,
  type RecurringRuleInput,
  type RecurringRuleRow,
} from "./types";

const RULE_COLUMNS =
  "id, name, kind, amount_kurus, account_id, category_id, note, " +
  "freq, day_of, month_of, start_date, end_date, last_run_date, paused_at";

async function fetchRules(): Promise<RecurringRule[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("recurring_rules")
    .select(RULE_COLUMNS)
    .order("paused_at", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });

  if (error) throw toUserError(error, "Düzenli işlemler yüklenemedi");
  return (data as unknown as RecurringRuleRow[]).map(toRecurringRule);
}

export function useRecurringRules() {
  return useQuery({ queryKey: qk.recurring(), queryFn: fetchRules });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecurringRuleInput) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("recurring_rules")
        .insert(toRuleRowInput(input));

      if (error) throw toUserError(error, "Düzenli işlem eklenemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.recurring() });
    },
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: RecurringRuleInput }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("recurring_rules")
        .update(toRuleRowInput(input))
        .eq("id", id);

      if (error) throw toUserError(error, "Düzenli işlem güncellenemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.recurring() });
    },
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("recurring_rules").delete().eq("id", id);
      if (error) throw toUserError(error, "Düzenli işlem silinemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.recurring() });
      // Üretilmiş işlemlerin `recurring_id`'si null'a düşer (set null),
      // ama işlemlerin kendisi durur — yine de liste tazelensin.
      void qc.invalidateQueries({ queryKey: qk.transactions() });
    },
  });
}

/** Duraklat / devam ettir. */
export function useToggleRulePause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paused }: { id: string; paused: boolean }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("recurring_rules")
        .update({ paused_at: paused ? new Date().toISOString() : null })
        .eq("id", id);

      if (error) throw toUserError(error, "Durum değiştirilemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.recurring() });
    },
  });
}

/**
 * Vadesi gelmiş bir tekrarı ONAYLAYIP işleme çevirir.
 *
 * ── İKİ YAZMA, TEK MANTIKSAL İŞLEM ──
 *
 * (1) `transactions` satırı eklenir, (2) kuralın `last_run_date`'i
 * ilerletilir. İkisi arasında bir hata olursa işlem yazılmış ama
 * kural ilerlememiş olur ve aynı vade tekrar önerilir — kullanıcı
 * aynı kirayı iki kez kaydedebilir.
 *
 * Bunu tek bir Postgres fonksiyonuna almak doğru çözümdür, ama
 * `last_run_date` ileri alındıktan sonra işlem yazılamazsa bu sefer
 * vade SESSİZCE kaybolur — daha kötü bir hata. Bu yüzden sıra
 * bilinçli: ÖNCE işlem (asıl veri), SONRA damga. Çift kayıt
 * kullanıcının göreceği ve silebileceği bir hatadır; kaybolan vade
 * görülmez.
 */
export function useConfirmOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rule,
      date,
      override,
    }: {
      rule: RecurringRule;
      date: DateStr;
      /** Kullanıcı tutarı/kategoriyi onay anında değiştirebilir. */
      override?: Partial<Pick<TransactionInput, "amountKurus" | "categoryId" | "note">>;
    }) => {
      const supabase = createClient();

      const { error: txError } = await supabase.from("transactions").insert({
        kind: rule.kind,
        amount_kurus: override?.amountKurus ?? rule.amountKurus,
        date,
        account_id: rule.accountId,
        counter_account_id: null,
        category_id:
          override?.categoryId !== undefined ? override.categoryId : rule.categoryId,
        note: override?.note !== undefined ? override.note : rule.note,
        voice_transcript: null,
        source: "recurring",
        recurring_id: rule.id,
      });

      if (txError) throw toUserError(txError, "İşlem oluşturulamadı");

      // Damgayı yalnızca İLERİ al: kullanıcı geçmiş bir vadeyi
      // sonradan onaylarsa (sıra dışı ama mümkün), damgayı geri
      // çekmek daha yeni vadeleri tekrar önerir.
      const nextStamp =
        rule.lastRunDate && rule.lastRunDate > date ? rule.lastRunDate : date;

      const { error: ruleError } = await supabase
        .from("recurring_rules")
        .update({ last_run_date: nextStamp })
        .eq("id", rule.id);

      if (ruleError) throw toUserError(ruleError, "Kural güncellenemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.recurring() });
      void qc.invalidateQueries({ queryKey: qk.transactions() });
      void qc.invalidateQueries({ queryKey: qk.balances() });
      void qc.invalidateQueries({ queryKey: qk.budgets() });
    },
  });
}

/**
 * Vadeyi ATLA: işlem üretmeden damgayı ilerletir.
 *
 * "Bu ay kirayı ödemedim" durumu. Vade listede takılı kalmamalı ama
 * olmamış bir ödeme de kaydedilmemeli.
 */
export function useSkipOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rule, date }: { rule: RecurringRule; date: DateStr }) => {
      const supabase = createClient();
      const nextStamp =
        rule.lastRunDate && rule.lastRunDate > date ? rule.lastRunDate : date;

      const { error } = await supabase
        .from("recurring_rules")
        .update({ last_run_date: nextStamp })
        .eq("id", rule.id);

      if (error) throw toUserError(error, "Vade atlanamadı");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.recurring() });
    },
  });
}
