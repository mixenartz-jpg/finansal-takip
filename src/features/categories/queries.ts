"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query/keys";
import { toUserError } from "@/lib/db/errors";
import {
  toCategory,
  type Category,
  type CategoryInput,
  type CategoryPatch,
  type CategoryRow,
} from "./types";

const CATEGORY_COLUMNS =
  "id, name, kind, icon, color_slot, keywords, sort_order, archived_at";

async function fetchCategories(): Promise<Category[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .is("archived_at", null)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw toUserError(error, "Kategoriler yüklenemedi");
  return (data as CategoryRow[]).map(toCategory);
}

export function useCategories() {
  return useQuery({ queryKey: qk.categories(), queryFn: fetchCategories });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CategoryInput) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("categories")
        .insert({
          name: input.name.trim(),
          kind: input.kind,
          keywords: input.keywords,
        })
        .select(CATEGORY_COLUMNS)
        .single();

      // "duplicate key" dahil tanidik kisitlar ortak katmanda cevrilir.
      if (error) throw toUserError(error, "Kategori eklenemedi");
      return toCategory(data as CategoryRow);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.categories() });
    },
  });
}

/**
 * Kategorinin anahtar kelimelerini gunceller.
 *
 * Sesli girisi kisisellestirmenin ana yolu: kullanici "migros"
 * kelimesini kendi kategorisine baglayabilir ve parser bir sonraki
 * seferde onu dogru esler.
 */
export function useUpdateCategoryKeywords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, keywords }: { id: string; keywords: string[] }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("categories")
        .update({ keywords })
        .eq("id", id);

      if (error) throw toUserError(error, "Anahtar kelimeler kaydedilemedi");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.categories() });
    },
  });
}

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
