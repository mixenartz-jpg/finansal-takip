"use client";

import { useState } from "react";
import { useAccounts } from "@/features/accounts/queries";
import { useCategories } from "@/features/categories/queries";
import {
  useRecentTransactions,
  useDeleteTransaction,
} from "@/features/transactions/queries";
import { TransactionList } from "@/features/transactions/TransactionList";

export default function IslemlerPage() {
  const accounts = useAccounts();
  const categories = useCategories();
  const transactions = useRecentTransactions(200);
  const deleteTransaction = useDeleteTransaction();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

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
      />
    </div>
  );
}
