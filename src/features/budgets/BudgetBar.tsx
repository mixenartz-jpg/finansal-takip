"use client";

import { formatTRYCompact } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import { budgetStatus, spentRatio, overspendKurus } from "./progress";
import type { BudgetProgress } from "./types";

/**
 * Tek bütçe satırı: kategori, ilerleme çubuğu, kalan/aşım.
 *
 * ── RENK ANLAM TAŞIR, SÜSLEME DEĞİL ──
 *
 * Çubuk normalde nötr mürekkep; yalnızca eşiğe yaklaşınca sarı,
 * aşınca kırmızı olur. Her çubuğu baştan renklendirmek "durum"
 * bilgisini yok ederdi — hepsi renkliyse hiçbiri dikkat çekmez.
 *
 * ── RENK TEK GÖSTERGE DEĞİL ──
 *
 * Durum ayrıca metinle bildirilir ("1.200 ₺ aştınız"). Renk körü
 * bir kullanıcı ya da gri basılmış bir ekranda çubuğun rengi
 * kaybolur; sayı kaybolmaz.
 */

interface BudgetBarProps {
  progress: BudgetProgress;
  categoryName: string;
  onEdit?: () => void;
}

export function BudgetBar({ progress, categoryName, onEdit }: BudgetBarProps) {
  const status = budgetStatus(progress);
  const ratio = spentRatio(progress);
  const over = overspendKurus(progress);

  // Çubuk genişliği %100'de kırpılır (taşan bir çubuk kutusunu
  // kırardı), ama aşım miktarı metinde tam olarak yazılır.
  const width = Math.min(ratio, 1) * 100;

  const barColor =
    status === "over"
      ? "bg-[var(--expense)]"
      : status === "warning"
        ? "bg-[var(--warning)]"
        : "bg-[var(--ink-2)]";

  const Wrapper = onEdit ? "button" : "div";

  return (
    <Wrapper
      {...(onEdit ? { type: "button" as const, onClick: onEdit } : {})}
      className={[
        "flex w-full flex-col gap-1.5 px-3 py-2.5 text-left",
        onEdit
          ? "transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-2)]"
          : "",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-[var(--ink)]">{categoryName}</span>
        <span className="tnum shrink-0 text-[13px] text-[var(--ink-3)]">
          {formatTRYCompact(progress.spentKurus)}
          {" / "}
          {formatTRYCompact(progress.limitKurus)}
        </span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-2)]"
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${categoryName} bütçesi`}
      >
        <div
          className={`h-full rounded-[var(--r-full)] ${barColor} transition-[width] duration-[var(--dur)] ease-[var(--ease)] motion-reduce:transition-none`}
          style={{ width: `${width}%` }}
        />
      </div>

      <p
        className={[
          "tnum text-[13px]",
          status === "over"
            ? "text-[var(--expense)]"
            : status === "warning"
              ? "text-[var(--warning)]"
              : "text-[var(--ink-3)]",
        ].join(" ")}
      >
        {statusText(status, over, progress.remainingKurus)}
      </p>
    </Wrapper>
  );
}

/**
 * Durum metni.
 *
 * ── TAM LİMİT AYRI CÜMLE İSTER ──
 *
 * Limit 2.000 TL ve 2.000 TL harcanmışsa durum `over`'dır (geriye
 * harcanacak para kalmadı), ama aşım miktarı sıfırdır. Tek şablon
 * kullanmak "0 ₺ aştınız" gibi kendini yalanlayan bir cümle üretir:
 * ya aştıysanız sıfır olmaz, ya sıfırsa aşmadınız demektir.
 */
function statusText(
  status: ReturnType<typeof budgetStatus>,
  over: Kurus,
  remaining: Kurus,
): string {
  if (status === "over") {
    return over === 0
      ? "Limit doldu"
      : `${formatTRYCompact(over)} aştınız`;
  }
  return `${formatTRYCompact(remaining)} kaldı`;
}
