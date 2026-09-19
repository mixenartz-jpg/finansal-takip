"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query/keys";
import { toUserError } from "@/lib/db/errors";
import { toCategory, type Category, type CategoryInput, type CategoryRow } from "./types";

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
