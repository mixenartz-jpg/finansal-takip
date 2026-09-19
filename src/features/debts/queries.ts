"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query/keys";
import { toUserError } from "@/lib/db/errors";
import type { Kurus } from "@/lib/money/types";
import type { DateStr } from "@/lib/date/types";
import {
  toDebt,
  toDebtPayment,
  toDebtRowInput,
  type Debt,
  type DebtBalance,
  type DebtBalanceRow,
  type DebtInput,
  type DebtPayment,
  type DebtPaymentRow,
  type DebtRow,
  type PaymentInput,
} from "./types";

const DEBT_COLUMNS =
  "id, direction, counterparty, principal_kurus, opened_on, due_on, note";
const BALANCE_COLUMNS =
  "debt_id, direction, principal_kurus, paid_kurus, remaining_kurus, " +
  "payment_count, last_payment_date";
const PAYMENT_COLUMNS = "id, debt_id, amount_kurus, date, note, transaction_id";

/**
 * Borçlar ve ödeme özetleri birleştirilmiş.
 *
 * `debt_balances` görünümü ödeme toplamını verir ama borcun kendi
 * alanlarını (karşı taraf, açılış, vade, not) taşımaz; ikisi
 * burada birleştirilir. Görünüme tüm sütunları eklemek yerine bu
 * yol seçildi: görünüm tek işe odaklı kalsın, birleştirme ucuz.
 */
async function fetchDebtBalances(): Promise<DebtBalance[]> {
  const supabase = createClient();

  const [debtsResult, balancesResult] = await Promise.all([
    supabase.from("debts").select(DEBT_COLUMNS).order("opened_on", { ascending: false }),
    supabase.from("debt_balances").select(BALANCE_COLUMNS),
  ]);

  if (debtsResult.error) throw toUserError(debtsResult.error, "Borçlar yüklenemedi");
  if (balancesResult.error) {
    throw toUserError(balancesResult.error, "Borç özetleri yüklenemedi");
  }

  const debts = (debtsResult.data as unknown as DebtRow[]).map(toDebt);
  const byId = new Map(
    (balancesResult.data as unknown as DebtBalanceRow[]).map((b) => [b.debt_id, b]),
  );

  return debts.map((d) => {
    const b = byId.get(d.id);
    return {
      ...d,
      debtId: d.id,
      // Görünümde satır yoksa (teorik) anapara kadar kalan varsayılır
      // — "0 kaldı" demek borcu kapanmış gösterirdi.
      paidKurus: (b?.paid_kurus ?? 0) as Kurus,
      remainingKurus: (b?.remaining_kurus ?? d.principalKurus) as Kurus,
      paymentCount: b?.payment_count ?? 0,
      lastPaymentDate: (b?.last_payment_date ?? null) as DateStr | null,
    };
  });
}

export function useDebtBalances() {
  return useQuery({ queryKey: qk.debts(), queryFn: fetchDebtBalances });
}

async function fetchPayments(debtId: string): Promise<DebtPayment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("debt_payments")
    .select(PAYMENT_COLUMNS)
    .eq("debt_id", debtId)
    .order("date", { ascending: false });

  if (error) throw toUserError(error, "Ödemeler yüklenemedi");
  return (data as unknown as DebtPaymentRow[]).map(toDebtPayment);
}

export function useDebtPayments(debtId: string | null) {
  return useQuery({
    queryKey: qk.debtPayments(debtId ?? ""),
    queryFn: () => fetchPayments(debtId as string),
    enabled: debtId !== null,
  });
}

export function useCreateDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DebtInput) => {
      const supabase = createClient();
      const { error } = await supabase.from("debts").insert(toDebtRowInput(input));
      if (error) throw toUserError(error, "Borç eklenemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.debts() });
    },
  });
}

export function useUpdateDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: DebtInput }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("debts")
        .update(toDebtRowInput(input))
        .eq("id", id);
      if (error) throw toUserError(error, "Borç güncellenemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.debts() });
    },
  });
}

export function useDeleteDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // Ödemeler `on delete cascade` ile gider; ama ödemelerin
      // bağlı olduğu İŞLEMLER durur (ayrı tablo, cascade yok).
      // Bu doğru: gerçekten olmuş bir para hareketi, borç kaydı
      // silindi diye kaybolmamalı.
      const { error } = await supabase.from("debts").delete().eq("id", id);
      if (error) throw toUserError(error, "Borç silinemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.debts() });
    },
  });
}

/**
 * Ödeme kaydeder; isteğe bağlı olarak bir para hareketi de yaratır.
 *
 * ── İKİ YAZMA, BİLİNÇLİ SIRA ──
 *
 * `createTransaction` işaretliyse ÖNCE işlem yazılır, SONRA ödeme
 * ona bağlanır. Ters sıra (önce ödeme, sonra işlem) yarıda kalırsa
 * bakiyeye yansımamış bir ödeme kalır ve kullanıcı bunu fark etmez.
 * Bu sırada yarıda kalırsa ortada sahipsiz bir işlem kalır — o
 * işlem listesinde GÖRÜNÜR ve silinebilir.
 *
 * ── YÖN, İŞLEM TÜRÜNÜ BELİRLER ──
 *
 * Borcumu ödüyorsam para çıkıyor (gider). Alacağımı tahsil
 * ediyorsam para giriyor (gelir).
 */
export function useAddPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      direction,
      counterparty,
    }: {
      input: PaymentInput;
      direction: "payable" | "receivable";
      counterparty: string;
    }) => {
      const supabase = createClient();
      let transactionId: string | null = null;

      if (input.createTransaction && input.accountId) {
        const { data, error } = await supabase
          .from("transactions")
          .insert({
            kind: direction === "payable" ? "expense" : "income",
            amount_kurus: input.amountKurus,
            date: input.date,
            account_id: input.accountId,
            counter_account_id: null,
            // Borç ödemesinin kategorisi yok: bir kategoriye
            // saymak ("Diğer") kategori raporunu bozar — borç
            // ödemesi bir tüketim değil, bir yükümlülük kapatma.
            category_id: null,
            note:
              input.note ??
              (direction === "payable"
                ? `${counterparty} borç ödemesi`
                : `${counterparty} alacak tahsilatı`),
            voice_transcript: null,
            source: "manual",
            recurring_id: null,
          })
          .select("id")
          .single();

        if (error) throw toUserError(error, "İşlem oluşturulamadı");
        transactionId = (data as unknown as { id: string }).id;
      }

      const { error: payError } = await supabase.from("debt_payments").insert({
        debt_id: input.debtId,
        amount_kurus: input.amountKurus,
        date: input.date,
        note: input.note,
        transaction_id: transactionId,
      });

      if (payError) {
        // ── YARIM KALMIŞ YAZMA: KULLANICIYA SÖYLE ──
        //
        // İşlem yazıldı ama ödeme yazılamadı. Genel bir "ödeme
        // kaydedilemedi" mesajı kullanıcıya hiçbir şeyin olmadığını
        // düşündürür; aynı gideri elle tekrar girer ve bu sefer
        // GERÇEK bir çift kayıt oluşur.
        //
        // Hata fırlatıldığı için `onSuccess` çalışmaz ve işlem
        // listesi tazelenmez — orphan işlem sayfa yenilenene kadar
        // görünmez. Bu yüzden tazelemeyi burada elle tetikliyoruz:
        // kullanıcı "işlemler listesinden kontrol edin" dediğimizde
        // orada gerçekten görebilmeli.
        if (transactionId !== null) {
          void qc.invalidateQueries({ queryKey: qk.transactions() });
          void qc.invalidateQueries({ queryKey: qk.balances() });
          throw new Error(
            "İşlem oluşturuldu ama ödeme kaydedilemedi. " +
              "İşlemler listesinden kontrol edin; ödemeyi tekrar eklemeden önce " +
              "oluşan işlemi silmeniz gerekebilir.",
          );
        }
        throw toUserError(payError, "Ödeme kaydedilemedi");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.debts() });
      void qc.invalidateQueries({ queryKey: qk.transactions() });
      void qc.invalidateQueries({ queryKey: qk.balances() });
      void qc.invalidateQueries({ queryKey: qk.budgets() });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const supabase = createClient();
      // Bağlı işlem SİLİNMEZ: gerçekten olmuş bir para hareketini
      // borç defterindeki bir düzeltme yüzünden yok etmek bakiyeyi
      // bozar. Kullanıcı isterse işlemi ayrıca siler.
      const { error } = await supabase
        .from("debt_payments")
        .delete()
        .eq("id", paymentId);
      if (error) throw toUserError(error, "Ödeme silinemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.debts() });
    },
  });
}
