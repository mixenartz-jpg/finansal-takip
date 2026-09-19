"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query/keys";
import { toUserError } from "@/lib/db/errors";
import type { DateStr } from "@/lib/date/types";
import {
  toBudgetProgress,
  type BudgetInput,
  type BudgetProgress,
  type BudgetProgressRow,
} from "./types";

const PROGRESS_COLUMNS =
  "budget_id, category_id, month, limit_kurus, spent_kurus, remaining_kurus";

/**
 * Bir ayın bütçeleri, gerçek harcamalarıyla birlikte.
 *
 * `budget_progress` görünümü limiti ve o ayın gider toplamını tek
 * satırda döndürür — istemci binlerce işlemi indirip toplamaz.
 */
async function fetchProgress(month: DateStr): Promise<BudgetProgress[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("budget_progress")
    .select(PROGRESS_COLUMNS)
    .eq("month", month);

  if (error) throw toUserError(error, "Bütçeler yüklenemedi");
  return (data as unknown as BudgetProgressRow[]).map(toBudgetProgress);
}

export function useBudgetProgress(month: DateStr) {
  return useQuery({
    queryKey: qk.budgetsMonth(month),
    queryFn: () => fetchProgress(month),
  });
}

/**
 * Bütçe oluşturur ya da günceller.
 *
 * `upsert` kullanılır çünkü kullanıcı için ikisi aynı eylemdir:
 * "Yemek için 5.000 TL" demek, limit yoksa kurar, varsa değiştirir.
 * Ayrı "ekle" ve "düzenle" yolları, formda hangisinin çağrılacağını
 * bilmek için önce bir sorgu gerektirirdi.
 *
 * ── `onConflict` NEDEN `user_id` İÇERİYOR ──
 *
 * İstemci `user_id` GÖNDERMEZ, `stamp_user_id()` trigger'ı yazar.
 * Buna rağmen çakışma hedefi üç sütunu da sayar ve bu doğrudur:
 * trigger `BEFORE INSERT`'tir, yani satır benzersizlik kısıtına
 * karşı değerlendirilmeden ÖNCE `user_id` dolmuş olur. Postgres'in
 * `ON CONFLICT (sütun listesi)` ifadesi yalnızca var olan bir
 * benzersiz indeksle eşleşmeyi gerektirir; o sütunların istemcinin
 * gönderdiği JSON'da bulunmasını şart koşmaz.
 */
export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BudgetInput) => {
      const supabase = createClient();
      const { error } = await supabase.from("budgets").upsert(
        {
          category_id: input.categoryId,
          month: input.month,
          limit_kurus: input.limitKurus,
        },
        { onConflict: "user_id,category_id,month" },
      );

      if (error) throw toUserError(error, "Bütçe kaydedilemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.budgets() });
    },
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw toUserError(error, "Bütçe silinemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.budgets() });
    },
  });
}

/**
 * Önceki ayın limitlerini bu aya kopyalar.
 *
 * ── NEDEN OTOMATİK DEĞİL ──
 *
 * Bütçeler aya özel tutuluyor (kullanıcı tercihi). Her ay başında
 * limitleri yeniden girmek zahmetli olduğu için tek tıklık bir
 * kopyalama var; ama otomatik kopyalama sessizce yanlış bir bütçe
 * kurabilirdi — kullanıcı geçen ay tatil için Ulaşım limitini
 * yükselttiyse, o limit bu aya taşınmamalı.
 *
 * Mevcut limitler KORUNUR (`ignoreDuplicates`): bu ay zaten girilmiş
 * bir limiti geçen ayınkiyle ezmek, kullanıcının bilerek yaptığı
 * değişikliği geri alırdı.
 */
export function useCopyPreviousMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: DateStr; to: DateStr }) => {
      const supabase = createClient();

      const { data, error: readError } = await supabase
        .from("budgets")
        .select("category_id, limit_kurus")
        .eq("month", from);

      if (readError) throw toUserError(readError, "Geçen ayın bütçeleri okunamadı");

      const rows = data as unknown as { category_id: string; limit_kurus: number }[];
      if (rows.length === 0) {
        // `toUserError`'dan GEÇMEZ ve geçmemeli: bu bir veritabanı
        // hatası değil, beklenen bir durum. Çevrilecek ham Postgres
        // mesajı yok; cümle zaten kullanıcıya söylenecek hâlinde.
        throw new Error("Geçen ay için kayıtlı bütçe yok.");
      }

      // ── TEK BOZUK SATIR TÜM PARTİYİ DÜŞÜRMEMELİ ──
      //
      // Toplu `upsert` tek bir deyimdir: bir satır trigger'a
      // (`check_budget_category_kind`) ya da FK'ye takılırsa
      // TAMAMI geri alınır ve geçerli olan diğer bütçeler de
      // kopyalanmaz. Kullanıcı yalnızca "kopyalanamadı" görür,
      // hangi kategorinin sorun çıkardığını bilemez.
      //
      // Hangi kategorinin geçen aydan beri arşivlendiğini ya da
      // türünün değiştiğini ÖNCEDEN okuyup o satırları eliyoruz;
      // böylece kopyalama kısmen de olsa başarılı olur.
      const { data: catData, error: catError } = await supabase
        .from("categories")
        .select("id")
        .eq("kind", "expense")
        .is("archived_at", null);

      if (catError) throw toUserError(catError, "Kategoriler okunamadı");

      const validIds = new Set((catData as unknown as { id: string }[]).map((c) => c.id));
      const copyable = rows.filter((r) => validIds.has(r.category_id));
      const skipped = rows.length - copyable.length;

      if (copyable.length === 0) {
        throw new Error(
          "Geçen ayın bütçelerindeki kategoriler artık kullanılmıyor.",
        );
      }

      const { data: inserted, error } = await supabase
        .from("budgets")
        .upsert(
          copyable.map((r) => ({
            category_id: r.category_id,
            month: to,
            limit_kurus: r.limit_kurus,
          })),
          { onConflict: "user_id,category_id,month", ignoreDuplicates: true },
        )
        .select("id");

      if (error) throw toUserError(error, "Bütçeler kopyalanamadı");

      // `ignoreDuplicates` ile bu ay zaten limiti olan kategoriler
      // atlanır; kullanıcıya KAÇ TANESİNİN gerçekten eklendiğini
      // söyleyebilmek için eklenen satırlar geri okunur. Kaynak
      // satır sayısını döndürmek "6 bütçe kopyalandı" deyip 1 tane
      // eklemek anlamına gelirdi.
      return {
        copied: (inserted as unknown as { id: string }[] | null)?.length ?? 0,
        skipped,
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.budgets() });
    },
  });
}
