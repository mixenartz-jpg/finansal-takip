"use client";

import { useState } from "react";
import {
  useCategories,
  useUpdateCategory,
  useArchiveCategory,
} from "@/features/categories/queries";
import type { Category, CategoryPatch } from "@/features/categories/types";
import { CategoryEditForm } from "@/features/categories/CategoryEditForm";
import { EmptyState, Skeleton, Badge } from "@/components/ui";

export default function KategorilerPage() {
  const categories = useCategories();
  const updateCategory = useUpdateCategory();
  const archiveCategory = useArchiveCategory();
  const [editing, setEditing] = useState<Category | null>(null);
  const [pendingArchive, setPendingArchive] = useState<string | null>(null);

  function handleSave(patch: CategoryPatch) {
    if (!editing) return;
    updateCategory.mutate(
      { id: editing.id, patch },
      { onSuccess: () => setEditing(null) },
    );
  }

  // Arşivleme iki dokunuş ister: tek dokunuşla kategori kaybolursa
  // kullanıcı ne olduğunu anlamaz.
  function handleArchive(id: string) {
    if (pendingArchive !== id) {
      setPendingArchive(id);
      window.setTimeout(() => setPendingArchive(null), 4000);
      return;
    }
    archiveCategory.mutate(id);
    setPendingArchive(null);
  }

  const expense = (categories.data ?? []).filter((c) => c.kind === "expense");
  const income = (categories.data ?? []).filter((c) => c.kind === "income");
  const mutationError = updateCategory.error ?? archiveCategory.error;

  return (
    <div className="flex flex-col gap-4">
      <h1>Kategoriler</h1>

      {pendingArchive && (
        <p role="status" className="text-[13px] text-[var(--warning)]">
          Arşivlemek için tekrar dokunun.
        </p>
      )}

      {mutationError && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {mutationError.message}
        </p>
      )}

      {categories.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (categories.data ?? []).length === 0 ? (
        <EmptyState
          title="Kategori yok"
          description="Kayıt olurken varsayılan kategoriler oluşturulur. Görünmüyorsa sayfayı yenileyin."
        />
      ) : (
        <>
          <CategorySection
            title="Gider"
            items={expense}
            onEdit={setEditing}
            onArchive={handleArchive}
          />
          <CategorySection
            title="Gelir"
            items={income}
            onEdit={setEditing}
            onArchive={handleArchive}
          />
        </>
      )}

      {editing && (
        <div className="fixed inset-0 z-(--z-sheet)">
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setEditing(null)}
            className="absolute inset-0 bg-[var(--ink)]/20"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Kategoriyi düzenle"
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-3xl overflow-y-auto rounded-t-[var(--r-lg)] border-t border-[var(--border)] bg-[var(--bg)] p-4 sm:inset-x-4 sm:bottom-4 sm:rounded-[var(--r-lg)] sm:border"
          >
            <CategoryEditForm
              category={editing}
              saving={updateCategory.isPending}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CategorySection({
  title,
  items,
  onEdit,
  onArchive,
}: {
  title: string;
  items: readonly Category[];
  onEdit: (c: Category) => void;
  onArchive: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-[13px] font-medium text-[var(--ink-3)]">{title}</h2>
      <ul className="divide-y divide-[var(--border)] rounded-[var(--r-lg)] border border-[var(--border)]">
        {items.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[var(--ink)]">{c.name}</p>
              {c.keywords.length > 0 && (
                <p className="truncate text-[13px] text-[var(--ink-3)]">
                  {c.keywords.join(" · ")}
                </p>
              )}
            </div>
            {c.keywords.length > 0 && <Badge>{c.keywords.length}</Badge>}
            <button
              type="button"
              onClick={() => onEdit(c)}
              aria-label={`Kategoriyi düzenle: ${c.name}`}
              className="grid size-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--ink-3)] transition-colors hover:text-[var(--brand)]"
            >
              <PencilGlyph />
            </button>
            <button
              type="button"
              onClick={() => onArchive(c.id)}
              aria-label={`Kategoriyi arşivle: ${c.name}`}
              className="grid size-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--ink-3)] transition-colors hover:text-[var(--danger)]"
            >
              <ArchiveGlyph />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PencilGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ArchiveGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3h18v4H3zM5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M10 12h4" />
    </svg>
  );
}
