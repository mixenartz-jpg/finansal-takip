import { asKurus } from "@/lib/money/money";
import type { Kurus } from "@/lib/money/types";
import type { BudgetProgress } from "./types";

/**
 * Uyarı eşiği: limitin %85'i.
 *
 * Neden %85 ve neden bir eşik var: ay ortasında limitin %60'ını
 * harcamış olmak normaldir, %85'ini harcamış olmak "yavaşla"
 * sinyalidir. Eşik olmasaydı kullanıcı yalnızca aştığında —
 * yani yapabileceği bir şey kalmadığında — haber alırdı.
 */
export const WARN_RATIO = 0.85;

export type BudgetStatusKind = "ok" | "warning" | "over";

/**
 * Harcanan / limit oranı.
 *
 * 1'in üstü KIRPILMAZ: aşım miktarı bilgidir ve çağıran taraf
 * (çubuk genişliği) kırpmayı kendi yapar. Burada kırpmak "ne kadar
 * aştım" sorusunun cevabını yok ederdi.
 */
export function spentRatio(p: BudgetProgress): number {
  if (p.limitKurus === 0) return 0;
  return p.spentKurus / p.limitKurus;
}

/**
 * Bütçenin durumu.
 *
 * TAM LİMİT 'over' SAYILIR: limit 5.000 TL ise 5.000 TL harcamak
 * bütçeyi bitirmiştir; "tam kullandın ama aşmadın" ayrımı
 * kullanıcıya bir şey kazandırmaz, geriye harcanacak para kalmadığı
 * gerçeğini yumuşatır.
 */
export function budgetStatus(p: BudgetProgress): BudgetStatusKind {
  if (p.limitKurus === 0) return "ok";
  const ratio = spentRatio(p);
  if (ratio >= 1) return "over";
  if (ratio >= WARN_RATIO) return "warning";
  return "ok";
}

/** Limiti aşan miktar. Aşım yoksa sıfır — negatif dönmez. */
export function overspendKurus(p: BudgetProgress): Kurus {
  const over = p.spentKurus - p.limitKurus;
  return asKurus(over > 0 ? over : 0);
}

export interface BudgetSummary {
  totalLimitKurus: Kurus;
  totalSpentKurus: Kurus;
  totalOverspendKurus: Kurus;
  overCount: number;
  warningCount: number;
  /** Aşan bütçeler — panel uyarısı bunları adıyla gösterir. */
  over: BudgetProgress[];
}

/**
 * Ay genelinde bütçe özeti.
 *
 * Panel bu özeti tek satırda gösterir; kullanıcı bütçe sayfasına
 * girmeden "bu ay durumum ne" sorusunun cevabını alır.
 */
export function summarizeBudgets(list: readonly BudgetProgress[]): BudgetSummary {
  let totalLimit = 0;
  let totalSpent = 0;
  let totalOverspend = 0;
  let overCount = 0;
  let warningCount = 0;
  const over: BudgetProgress[] = [];

  for (const p of list) {
    totalLimit += p.limitKurus;
    totalSpent += p.spentKurus;
    totalOverspend += overspendKurus(p);

    const status = budgetStatus(p);
    if (status === "over") {
      overCount++;
      over.push(p);
    } else if (status === "warning") {
      warningCount++;
    }
  }

  return {
    totalLimitKurus: asKurus(totalLimit),
    totalSpentKurus: asKurus(totalSpent),
    totalOverspendKurus: asKurus(totalOverspend),
    overCount,
    warningCount,
    over,
  };
}
