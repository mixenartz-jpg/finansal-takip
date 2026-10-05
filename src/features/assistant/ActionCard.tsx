"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { formatTRY } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import { isDateStr } from "@/lib/date/date";
import { formatLongDate } from "@/lib/ui/tr";
import type { PendingAction } from "./conversation";
import { initialSelection, targetSpec, toggleSelection } from "./targets";
import { TargetPicker, useTargetCandidates, type Target } from "./TargetPicker";

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
  /** Mesaj kimliği — seçicinin radyo grubu adı için. */
  id: string;
  action: PendingAction;
  saving: boolean;
  /** Hedef seçen araçlarda seçilen kayıtlarla, diğerlerinde boş dizi ile çağrılır. */
  onConfirm: (targets: Target[]) => void;
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
  // Hedef tarifi — "Aranan" başlığı altında gösterilir.
  matchCategoryName: "Kategori",
  matchNote: "Açıklama",
  matchAmountKurus: "Tutar",
  ruleName: "Kural",
  debtCounterparty: "Kişi/kurum",
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

/** Argüman değerini okunur metne çevirir. */
function formatValue(key: string, value: unknown): string | null {
  if (key.endsWith("Kurus")) {
    return typeof value === "number" ? formatTRY(value as Kurus) : null;
  }
  if (key === "kind") return KIND_LABELS[String(value)] ?? String(value);
  if (key === "freq") return FREQ_LABELS[String(value)] ?? String(value);
  if (key === "direction") return DIRECTION_LABELS[String(value)] ?? String(value);
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

interface Row {
  key: string;
  label: string;
  text: string;
}

function toRows(entries: [string, unknown][]): Row[] {
  return entries
    .map(([key, value]) => ({ key, label: ARG_LABELS[key] ?? key, text: formatValue(key, value) }))
    .filter((r): r is Row => r.text !== null);
}

/** Tarif tarih aralığı tek satır: "Dün" ya da "1 Ekim – 4 Ekim". */
function rangeText(from: unknown, to: unknown): string | null {
  if (typeof from !== "string" || typeof to !== "string") return null;
  if (!isDateStr(from) || !isDateStr(to)) return null;
  return from === to ? formatLongDate(from) : `${formatLongDate(from)} – ${formatLongDate(to)}`;
}

export function ActionCard({ id, action, saving, onConfirm, onCancel }: ActionCardProps) {
  const { intent, status } = action;
  const title = TOOL_LABELS[intent.name] ?? intent.name;
  const spec = targetSpec(intent.name);
  const targets = useTargetCandidates(intent, spec);

  /*
   * ── SEÇİM TÜRETİLMİŞ STATE ──
   *
   * Kullanıcı dokunana kadar `picked` null kalır ve seçim adaylardan
   * türetilir (tek aday → seçili). Adaylar yüklenince efektle state
   * yazmak gerekmiyor; ilk dokunuşta türetilen değer kopyalanıp
   * değiştiriliyor.
   */
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? initialSelection(targets.candidates);
  const chosen = targets.candidates.filter((t) => selected.includes(t.id));

  const matchKeys = spec?.matchKeys ?? [];
  const matchRows = toRows(
    Object.entries(intent.args).filter(
      ([k]) => matchKeys.includes(k) && k !== "matchFrom" && k !== "matchTo",
    ),
  );
  const range = rangeText(intent.args.matchFrom, intent.args.matchTo);
  if (range) matchRows.unshift({ key: "matchRange", label: "Tarih", text: range });

  const rows = toRows(Object.entries(intent.args).filter(([k]) => !matchKeys.includes(k)));

  /*
   * Güncelleme aracı yeni değer taşımıyorsa onaylanacak bir şey yok:
   * aynı veriyi yazmak "uygulandı" der ama hiçbir şey değişmez.
   */
  const needsChanges = intent.name.startsWith("update");
  const nothingToShow = needsChanges ? rows.length === 0 : rows.length + matchRows.length === 0;
  const blocked =
    nothingToShow || (spec !== null && (targets.loading || targets.problem !== null || chosen.length === 0));

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-sm font-medium text-[var(--ink)]">{title}</p>

      {/*
        ── GÖRÜNÜR SATIR YOKSA ──

        Güncelleme niyeti yalnızca hedefi tarif edip yeni değer
        taşımıyorsa başlık + "Onayla" düğmesi kalırdı, arada NE
        DEĞİŞECEĞİ belirsiz. Hiçbir şey göstermeyen bir onay ekranı,
        onay almıyor demektir.
      */}
      {nothingToShow && (
        <p className="mt-2 text-[13px] text-[var(--warning)]">
          {needsChanges
            ? "Neyin değişeceğini anlayamadım — yeni değeri söyler misin?"
            : "Ne değişeceğini gösteremiyorum — bunu ilgili sayfadan elle yapman daha güvenli."}
        </p>
      )}

      {matchRows.length > 0 && (
        <>
          <p className="mt-2 text-[12px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
            Aranan
          </p>
          <ArgList rows={matchRows} />
        </>
      )}

      {rows.length > 0 && (
        <>
          {matchRows.length > 0 && (
            <p className="mt-2 text-[12px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
              {needsChanges ? "Yeni değerler" : "Ayrıntılar"}
            </p>
          )}
          <ArgList rows={rows} />
        </>
      )}

      {spec && status === "pending" && (
        <TargetPicker
          name={`hedef-${id}`}
          spec={spec}
          state={targets}
          selected={selected}
          disabled={saving}
          onToggle={(targetId) => setPicked(toggleSelection(selected, targetId, spec.multi))}
        />
      )}

      {status === "pending" && (
        <div className="mt-3 flex gap-2">
          <Button
            variant={intent.name.startsWith("delete") ? "danger" : "primary"}
            onClick={() => onConfirm(chosen)}
            loading={saving}
            // Gösterilecek hiçbir alan yoksa ya da hedef kayıt
            // seçilmediyse onay istenmez: kullanıcı ne onayladığını
            // bilmeden düğmeye basmamalı.
            disabled={blocked}
            full
          >
            {spec?.multi && chosen.length > 1
              ? `${chosen.length} kaydı onayla`
              : intent.needsConfirm
                ? "Onayla"
                : "Uygula"}
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

function ArgList({ rows }: { rows: Row[] }) {
  return (
    <dl className="mt-1 flex flex-col gap-1">
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
  );
}
