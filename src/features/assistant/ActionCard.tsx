"use client";

import { Button } from "@/components/ui";
import { formatTRY } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { PendingAction } from "./conversation";

/**
 * Asistanın önerdiği eylemin onay kartı.
 *
 * ── NEDEN ONAY ──
 *
 * Asistan hiçbir şeyi kendi başına kaydetmez. Model tarih aralığını
 * yanlış anlayabilir, tutarı yanlış duyabilir, kategoriyi
 * karıştırabilir. Kullanıcı NE OLACAĞINI görmeden hiçbir yazma
 * işlemi gerçekleşmiyor.
 *
 * ── NEDEN KART DEĞİL DE SATIR GİBİ ──
 *
 * Sohbet akışının içinde duruyor. İç içe kart (sohbet balonu +
 * kart) bu kod tabanında yasak; bu yüzden kendi yüzeyi var ama
 * balonun içine gömülmüyor.
 */

interface ActionCardProps {
  action: PendingAction;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Araç adlarının Türkçe karşılığı — kullanıcı `createTransaction` görmemeli. */
const TOOL_LABELS: Record<string, string> = {
  createTransaction: "İşlem ekle",
  updateTransaction: "İşlemi güncelle",
  deleteTransaction: "İşlem sil",
  createAccount: "Hesap ekle",
  updateAccount: "Hesabı güncelle",
  archiveAccount: "Hesabı arşivle",
  createCategory: "Kategori ekle",
  updateCategory: "Kategoriyi güncelle",
  setBudget: "Bütçe belirle",
  deleteBudget: "Bütçeyi kaldır",
  createRecurringRule: "Düzenli ödeme ekle",
  updateRecurringRule: "Düzenli ödemeyi güncelle",
  deleteRecurringRule: "Düzenli ödemeyi sil",
  createDebt: "Borç ekle",
  updateDebt: "Borcu güncelle",
  addDebtPayment: "Borç ödemesi ekle",
  getBalances: "Bakiyeleri getir",
  getSpending: "Harcamayı hesapla",
  getBudgetStatus: "Bütçe durumunu getir",
  getDebts: "Borçları getir",
  findTransactions: "İşlemleri bul",
};

const KIND_LABELS: Record<string, string> = {
  income: "Gelir",
  expense: "Gider",
  transfer: "Transfer",
};

/** Argüman adlarının Türkçe karşılığı. */
const ARG_LABELS: Record<string, string> = {
  kind: "Tür",
  amountKurus: "Tutar",
  limitKurus: "Limit",
  openingKurus: "Açılış bakiyesi",
  creditLimitKurus: "Kredi limiti",
  date: "Tarih",
  dueDate: "Vade",
  from: "Başlangıç",
  to: "Bitiş",
  month: "Ay",
  accountName: "Hesap",
  counterAccountName: "Hedef hesap",
  categoryName: "Kategori",
  note: "Açıklama",
  name: "Ad",
  keywords: "Anahtar kelimeler",
  counterparty: "Kişi/kurum",
  direction: "Yön",
  freq: "Sıklık",
  dayOf: "Gün",
  monthOf: "Ay",
  ids: "Kayıtlar",
  id: "Kayıt",
  debtId: "Borç",
};

const FREQ_LABELS: Record<string, string> = {
  weekly: "Haftalık",
  monthly: "Aylık",
  yearly: "Yıllık",
};

const DIRECTION_LABELS: Record<string, string> = {
  payable: "Ben borçluyum",
  receivable: "Bana borçlu",
};

/**
 * Argüman değerini okunur metne çevirir.
 *
 * Kimlikler GÖSTERİLMEZ: kullanıcıya UUID göstermek bilgi değil
 * gürültüdür. Kimlik taşıyan alanlar sayı olarak özetleniyor.
 */
function formatValue(key: string, value: unknown): string | null {
  if (key === "id" || key === "debtId") return null;
  if (key === "ids") {
    return Array.isArray(value) ? `${value.length} kayıt` : null;
  }
  if (key.endsWith("Kurus")) {
    return typeof value === "number" ? formatTRY(value as Kurus) : null;
  }
  if (key === "kind") return KIND_LABELS[String(value)] ?? String(value);
  if (key === "freq") return FREQ_LABELS[String(value)] ?? String(value);
  if (key === "direction") return DIRECTION_LABELS[String(value)] ?? String(value);
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function ActionCard({ action, saving, onConfirm, onCancel }: ActionCardProps) {
  const { intent, status } = action;
  const title = TOOL_LABELS[intent.name] ?? intent.name;

  const rows = Object.entries(intent.args)
    .map(([key, value]) => ({ key, label: ARG_LABELS[key] ?? key, text: formatValue(key, value) }))
    .filter((r): r is { key: string; label: string; text: string } => r.text !== null);

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-sm font-medium text-[var(--ink)]">{title}</p>

      {/*
        ── GÖRÜNÜR SATIR YOKSA ──

        Kimlikler gizleniyor (UUID kullanıcıya bilgi değil gürültü).
        Ama `updateTransaction` gibi yalnızca `id` taşıyan bir
        niyette hiçbir satır kalmıyordu: başlık + "Onayla" düğmesi,
        arada NE DEĞİŞECEĞİ belirsiz. Hiçbir şey göstermeyen bir
        onay ekranı, onay almıyor demektir.
      */}
      {rows.length === 0 && (
        <p className="mt-2 text-[13px] text-[var(--warning)]">
          Ne değişeceğini gösteremiyorum — bunu ilgili sayfadan elle yapman daha güvenli.
        </p>
      )}

      {rows.length > 0 && (
        <dl className="mt-2 flex flex-col gap-1">
          {rows.map((r) => (
            <div key={r.key} className="flex items-baseline justify-between gap-3 text-[13px]">
              <dt className="shrink-0 text-[var(--ink-3)]">{r.label}</dt>
              {/* Tutarlar tabular rakam taşır: sayılar hizalı okunur. */}
              <dd
                className={[
                  "min-w-0 text-right text-[var(--ink-2)]",
                  r.key.endsWith("Kurus") ? "tnum font-medium text-[var(--ink)]" : "",
                ].join(" ")}
              >
                {r.text}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {status === "pending" && (
        <div className="mt-3 flex gap-2">
          <Button
            variant={intent.name.startsWith("delete") ? "danger" : "primary"}
            onClick={onConfirm}
            loading={saving}
            // Gösterilecek hiçbir alan yoksa onay istenmez: kullanıcı
            // ne onayladığını bilmeden düğmeye basmamalı.
            disabled={rows.length === 0}
            full
          >
            {intent.needsConfirm ? "Onayla" : "Uygula"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Vazgeç
          </Button>
        </div>
      )}

      {/*
        Sonuç durumu METİNLE bildiriliyor, yalnızca renkle değil:
        renk körü kullanıcı için yeşil/kırmızı ayrımı yoktur.
      */}
      {status === "done" && (
        <p role="status" className="mt-3 text-[13px] text-[var(--income)]">
          ✓ Uygulandı
        </p>
      )}
      {status === "cancelled" && (
        <p className="mt-3 text-[13px] text-[var(--ink-3)]">Vazgeçildi</p>
      )}
      {status === "failed" && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
          {action.error ?? "Uygulanamadı."}
        </p>
      )}
    </div>
  );
}
