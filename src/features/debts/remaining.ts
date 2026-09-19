import { asKurus } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import { diffDays } from "@/lib/date/date";
import type { DateStr } from "@/lib/date/types";
import type { DebtBalance } from "./types";

/**
 * Vadeye kaç gün kala "yaklaşıyor" sayılır.
 *
 * Bir hafta, ödeme ayarlamak için makul bir süre. Daha kısası uyarıyı
 * geç yapar, daha uzunu sürekli uyarı gösterip önemini yitirir.
 */
export const DUE_SOON_DAYS = 7;

export type DebtStatusKind = "open" | "partial" | "closed";
export type DueStatusKind = "none" | "ok" | "soon" | "overdue";

/**
 * Ödenen / anapara oranı.
 *
 * 1'in üstü kırpılmaz: fazla ödeme bilgidir ve çağıran taraf
 * (çubuk genişliği) kırpmayı kendi yapar.
 */
export function paidRatio(d: DebtBalance): number {
  if (d.principalKurus === 0) return 0;
  return d.paidKurus / d.principalKurus;
}

/**
 * Borcun durumu.
 *
 * `closed` bir SÜTUN DEĞİL, ödemelerden türetilir. Ayrı bir bayrak
 * tutulsaydı bir ödeme silindiğinde yalan söylerdi.
 */
export function debtStatus(d: DebtBalance): DebtStatusKind {
  if (d.remainingKurus <= 0) return "closed";
  if (d.paidKurus > 0) return "partial";
  return "open";
}

/**
 * Vade durumu.
 *
 * Kapanmış borçta vade anlamsızdır — ödenmiş bir borcun "vadesi
 * geçti" demek kullanıcıyı gereksiz telaşlandırır.
 */
export function dueStatus(d: DebtBalance, today: DateStr): DueStatusKind {
  if (d.dueOn === null) return "none";
  if (debtStatus(d) === "closed") return "none";

  const daysLeft = diffDays(d.dueOn, today);
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= DUE_SOON_DAYS) return "soon";
  return "ok";
}

export interface DebtSummary {
  /** Ödenmemiş borç toplamı. */
  payableRemainingKurus: Kurus;
  /** Tahsil edilmemiş alacak toplamı. */
  receivableRemainingKurus: Kurus;
  /** Alacak − borç. Negatifse net borçlusunuz. */
  netKurus: Kurus;
  overdueCount: number;
  dueSoonCount: number;
  openCount: number;
  /** Vadesi geçmiş ya da yaklaşmış borçlar — panel uyarısı. */
  needsAttention: DebtBalance[];
}

/**
 * Borç/alacak özeti.
 *
 * KAPANMIŞ BORÇLAR TOPLAMLARA GİRMEZ: ödenmiş bir borcu "hâlâ
 * borçlusun" diye saymak toplamı anlamsız kılar. Liste görünümünde
 * geçmiş kayıt olarak durmaya devam ederler.
 */
export function summarizeDebts(
  list: readonly DebtBalance[],
  today: DateStr,
): DebtSummary {
  let payable = 0;
  let receivable = 0;
  let overdueCount = 0;
  let dueSoonCount = 0;
  let openCount = 0;
  const needsAttention: DebtBalance[] = [];

  for (const d of list) {
    if (debtStatus(d) === "closed") continue;

    openCount++;
    if (d.direction === "payable") payable += d.remainingKurus;
    else receivable += d.remainingKurus;

    const due = dueStatus(d, today);
    if (due === "overdue") {
      overdueCount++;
      needsAttention.push(d);
    } else if (due === "soon") {
      dueSoonCount++;
      needsAttention.push(d);
    }
  }

  return {
    payableRemainingKurus: asKurus(payable),
    receivableRemainingKurus: asKurus(receivable),
    netKurus: asKurus(receivable - payable),
    overdueCount,
    dueSoonCount,
    openCount,
    needsAttention,
  };
}

/** Vade durumunun Türkçe etiketi. */
export function dueLabel(d: DebtBalance, today: DateStr): string | null {
  const status = dueStatus(d, today);
  if (status === "none" || status === "ok") return null;
  if (d.dueOn === null) return null;

  const daysLeft = diffDays(d.dueOn, today);

  // `overdue` yalnızca `daysLeft < 0` iken döner, dolayısıyla burada
  // gecikme daima en az bir gündür — "0 gün gecikti" durumu yok.
  // Vade günü bugün olan borç `soon` sayılır ve aşağıdaki satıra
  // düşer ("Bugün son gün").
  if (status === "overdue") {
    return `${-daysLeft} gün gecikti`;
  }
  return daysLeft === 0 ? "Bugün son gün" : `${daysLeft} gün kaldı`;
}
