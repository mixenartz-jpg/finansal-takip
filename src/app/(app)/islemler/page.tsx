"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useAccounts } from "@/features/accounts/queries";
import { useCategories } from "@/features/categories/queries";
import {
  useRecentTransactions,
  useDeleteTransaction,
  useUpdateTransaction,
} from "@/features/transactions/queries";
import { TransactionList } from "@/features/transactions/TransactionList";
import { TransactionEditForm } from "@/features/transactions/TransactionEditForm";
import type { Transaction, TransactionPatch } from "@/features/transactions/types";

export default function IslemlerPage() {
  const accounts = useAccounts();
  const categories = useCategories();
  const transactions = useRecentTransactions(200);
  const deleteTransaction = useDeleteTransaction();
  const updateTransaction = useUpdateTransaction();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);

  function handleDelete(id: string) {
    // Onay adimi: silme geri alinamaz ve tek dokunusla olmamali.
    if (pendingDelete !== id) {
      setPendingDelete(id);
      window.setTimeout(() => setPendingDelete(null), 4000);
      return;
    }
    deleteTransaction.mutate(id);
    setPendingDelete(null);
  }

  function handleSaveEdit(patch: TransactionPatch) {
    if (!editing) return;
    updateTransaction.mutate(
      { id: editing.id, patch },
      { onSuccess: () => setEditing(null) },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1>İşlemler</h1>

      {pendingDelete && (
        <p role="status" className="text-[13px] text-[var(--warning)]">
          Silmek için çöp kutusuna tekrar dokunun.
        </p>
      )}

      {deleteTransaction.error && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {deleteTransaction.error.message}
        </p>
      )}

      <TransactionList
        transactions={transactions.data ?? []}
        categories={categories.data ?? []}
        accounts={accounts.data ?? []}
        loading={transactions.isPending}
        onDelete={handleDelete}
        onEdit={setEditing}
      />

      {editing && (
        <Sheet label="İşlemi düzenle" onClose={() => setEditing(null)}>
          <TransactionEditForm
            transaction={editing}
            categories={categories.data ?? []}
            accounts={accounts.data ?? []}
            saving={updateTransaction.isPending}
            onSave={handleSaveEdit}
            onCancel={() => setEditing(null)}
          />
          {updateTransaction.error && (
            <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
              {updateTransaction.error.message}
            </p>
          )}
        </Sheet>
      )}
    </div>
  );
}
