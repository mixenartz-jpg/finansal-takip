"use client";

import { formatTRYCompact } from "@/lib/money/money";
import { formatLongDate } from "@/lib/ui/tr";
import type { DateStr } from "@/lib/date/types";
import { Badge } from "@/components/ui";
import { debtStatus, dueStatus, dueLabel, paidRatio } from "./remaining";
import type { DebtBalance } from "./types";

/**
 * Tek borç satırı: karşı taraf, kalan tutar, ilerleme, vade durumu.
 *
 * ── YÖN RENKLE DEĞİL, ETİKETLE AYRILIR ──
 *
 * "Borcum" kırmızı, "alacağım" yeşil yapmak cazip ama yanıltıcı:
 * kırmızı/yeşil bu uygulamada gider/gelir demek ve bir borç kaydı
 * henüz ne gider ne gelirdir — para hareketi ödeme yapılınca olur.
 * Yön, metin etiketiyle bildirilir; renk vade DURUMUNA ayrılır.
 */

interface DebtCardProps {
  debt: DebtBalance;
  today: DateStr;
  onClick?: () => void;
}

export function DebtCard({ debt, today, onClick }: DebtCardProps) {
  const status = debtStatus(debt);
  const due = dueStatus(debt, today);
  const label = dueLabel(debt, today);
  const ratio = Math.min(paidRatio(debt), 1);

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={[
        "flex w-full flex-col gap-1.5 px-3 py-3 text-left",
        onClick
          ? "transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-2)]"
          : "",
        status === "closed" ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-[var(--ink)]">
            {debt.counterparty}
          </span>
          {status === "closed" && <Badge tone="neutral">Kapandı</Badge>}
          {due === "overdue" && <Badge tone="expense">Gecikti</Badge>}
          {due === "soon" && <Badge tone="warning">Yaklaşıyor</Badge>}
        </div>

        <span className="tnum shrink-0 text-sm font-medium text-[var(--ink)]">
          {status === "closed"
            ? formatTRYCompact(debt.principalKurus)
            : formatTRYCompact(debt.remainingKurus)}
        </span>
      </div>

      {/* İlerleme çubuğu yalnızca kısmi ödemede anlamlı: hiç ödeme
          yoksa boş çubuk gürültü, kapanmışsa dolu çubuk tekrar. */}
      {status === "partial" && (
        <div
          className="h-1 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-2)]"
          role="progressbar"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${debt.counterparty} ödeme ilerlemesi`}
        >
          <div
            className="h-full rounded-[var(--r-full)] bg-[var(--ink-3)]"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-[var(--ink-3)]">
          {debt.direction === "payable" ? "Borcum" : "Alacağım"}
          {status === "partial" &&
            ` · ${formatTRYCompact(debt.paidKurus)} ödendi`}
          {status === "open" && ` · ${formatLongDate(debt.openedOn, today)}`}
        </span>

        {label && (
          <span
            className={`text-[13px] ${
              due === "overdue" ? "text-[var(--expense)]" : "text-[var(--warning)]"
            }`}
          >
            {label}
          </span>
        )}
        {!label && debt.dueOn && status !== "closed" && (
          <span className="text-[13px] text-[var(--ink-3)]">
            Son: {formatLongDate(debt.dueOn, today)}
          </span>
        )}
      </div>
    </Wrapper>
  );
}
