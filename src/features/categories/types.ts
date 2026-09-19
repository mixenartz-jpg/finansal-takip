export type CategoryKind = "income" | "expense";

export const CATEGORY_NAME_MAX = 40;

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string | null;
  colorSlot: number;
  /** Sesli girisin bu kategoriye eslemesi icin kullaniciya ozel kelimeler. */
  keywords: string[];
  sortOrder: number;
  archivedAt: string | null;
}

export interface CategoryRow {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string | null;
  color_slot: number;
  keywords: string[] | null;
  sort_order: number;
  archived_at: string | null;
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    icon: row.icon,
    colorSlot: row.color_slot,
    // Postgres text[] bos dizi olarak gelir ama null gelme ihtimaline
    // karsi korunuyoruz: parser bu alani dogrudan geziyor.
    keywords: row.keywords ?? [],
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
  };
}

export interface CategoryInput {
  name: string;
  kind: CategoryKind;
  keywords: string[];
}

export function validateCategory(input: Partial<CategoryInput>): {
  valid: boolean;
  errors: Partial<Record<keyof CategoryInput, string>>;
} {
  const errors: Partial<Record<keyof CategoryInput, string>> = {};
  const name = input.name?.trim() ?? "";

  if (name.length === 0) {
    errors.name = "Kategori adı girin.";
  } else if (name.length > CATEGORY_NAME_MAX) {
    errors.name = `Kategori adı en fazla ${CATEGORY_NAME_MAX} karakter olabilir.`;
  }

  if (!input.kind) {
    errors.kind = "Gelir mi gider kategorisi mi seçin.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
