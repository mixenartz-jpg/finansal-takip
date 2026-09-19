"use client";

import { useState } from "react";
import { formatTRYCompact } from "@/lib/money/money";
import { formatLongDate } from "@/lib/ui/tr";
import { todayStr } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";
import { Button, Card } from "@/components/ui";
import { useRecurringRules, useConfirmOccurrence, useSkipOccurrence } from "./queries";
import { dueOccurrences } from "./occurrence";
import type { RecurringRule } from "./types";

/**
 * Vadesi gelmiş düzenli işlemler.
 *
 * ── ONAY BEKLER, OTOMATİK KAYDETMEZ (ürün kararı) ──
 *
 * Kirayı bu ay geç ödediyseniz ya da tutar değiştiyse, otomatik kayıt
 * bakiyeyi yalancı yapar ve fark etmeniz haftalar alır. Onay bir
 * saniye sürer.
 *
 * Her vadenin üç yolu var: ONAYLA (işlem oluşur), ATLA (vade kapanır
 * ama işlem oluşmaz — "bu ay ödemedim"), ya da dokunmamak (listede
 * kalır).
 */

interface DueItem {
  rule: RecurringRule;
  date: DateStr;
}

export function DueBanner() {
  const rules = useRecurringRules();
  const confirm = useConfirmOccurrence();
  const skip = useSkipOccurrence();
  const [busy, setBusy] = useState<string | null>(null);

  const today = todayStr();

  // Vadeler SUNUCUDA tutulmaz; kural + son çalışma damgasından
  // türetilir. Böylece "vade kaydı" diye ikinci bir doğruluk kaynağı
  // oluşmaz ve kural değişince geçmiş vadeler kendiliğinden düzelir.
  const due: DueItem[] = (rules.data ?? []).flatMap((rule) =>
    dueOccurrences(rule, today).map((date) => ({ rule, date })),
  );

  if (rules.isPending || due.length === 0) return null;

  const key = (d: DueItem) => `${d.rule.id}:${d.date}`;

  // ── ÇİFT GÖNDERİM KORUMASI ──
  //
  // Bir işlem başladığında TÜM düğmeler kilitlenir — işlemi başlatan
  // satır dahil. Yalnızca `loading` prop'una güvenmek yetmez:
  // `setBusy` ile mutasyonun `isPending` olması arasında bir render
  // aralığı vardır ve o aralıkta düğme hâlâ tıklanabilir kalır.
  // Hızlı çift tık aynı kirayı iki kez kaydedebilirdi.

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-3 py-2">
        <p className="text-sm font-medium text-[var(--ink)]">
          {due.length === 1 ? "1 düzenli işlem bekliyor" : `${due.length} düzenli işlem bekliyor`}
        </p>
        <p className="text-[13px] text-[var(--ink-3)]">
          Onaylayınca kaydedilir. Ödemediyseniz atlayın.
        </p>
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {due.map((item) => {
          const k = key(item);
          const isBusy = busy === k;
          return (
            <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--ink)]">{item.rule.name}</p>
                <p className="text-[13px] text-[var(--ink-3)]">
                  {formatLongDate(item.date, today)}
                </p>
              </div>

              <p
                className={`tnum shrink-0 text-sm font-medium ${
                  item.rule.kind === "income"
                    ? "text-[var(--income)]"
                    : "text-[var(--expense)]"
                }`}
              >
                {item.rule.kind === "income" ? "+" : "−"}
                {formatTRYCompact(item.rule.amountKurus)}
              </p>

              <div className="flex shrink-0 gap-1.5">
                <Button
                  variant="primary"
                  loading={isBusy && confirm.isPending}
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy(k);
                    confirm.mutate(
                      { rule: item.rule, date: item.date },
                      { onSettled: () => setBusy(null) },
                    );
                  }}
                >
                  Onayla
                </Button>
                <Button
                  variant="ghost"
                  loading={isBusy && skip.isPending}
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy(k);
                    skip.mutate(
                      { rule: item.rule, date: item.date },
                      { onSettled: () => setBusy(null) },
                    );
                  }}
                >
                  Atla
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {(confirm.error || skip.error) && (
        <p role="alert" className="px-3 py-2 text-[13px] text-[var(--danger)]">
          {(confirm.error ?? skip.error)?.message}
        </p>
      )}
    </Card>
  );
}
