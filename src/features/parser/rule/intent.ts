import { normalize } from "@/lib/text/normalize";
import {
  EXPENSE_STRONG,
  EXPENSE_WEAK,
  INCOME_STRONG,
  INCOME_WEAK,
  INCOME_OBJECTS,
  TRANSFER_SIGNALS,
  matchesAny,
} from "./intent-lexicon";
import {
  hasExpenseCategorySignal,
  hasIncomeCategorySignal,
} from "./category-lexicon";

export type IntentKind = "income" | "expense" | "transfer";

export interface IntentResult {
  kind: IntentKind | null;
  confidence: number;
  warnings: string[];
  /** Karara yol açan sinyal — hata ayıklama ve onay kartı açıklaması. */
  reason: string | null;
}

/** Sinyal ağırlıkları. Güçlü bir sinyal zayıf olanı bastırmalı. */
const WEIGHT_STRONG = 3;
const WEIGHT_WEAK = 1;
const WEIGHT_OBJECT = 4;

/**
 * "aldım" ailesi — tek başına yön belirtmeyen fiiller.
 *
 * Bu fiiller görüldüğünde karar NESNEYE bakar: `INCOME_OBJECTS`
 * içinden biri geçiyorsa gelir, geçmiyorsa (ve bir mal/kategori
 * sinyali varsa) giderdir.
 */
const AMBIGUOUS_VERBS = ["aldim", "aldik", "aldi", "alicam", "alacagim"];

function hasAmbiguousVerb(text: string): boolean {
  return AMBIGUOUS_VERBS.some((v) => text.includes(v));
}

/**
 * Cümlenin gelir mi gider mi transfer mi olduğunu belirler.
 *
 * ── TASARIM: SKOR, TEK KURAL DEĞİL ──
 *
 * Tek bir anahtar kelimeye bakmak kırılgan: "ödeme geldi" hem "öde"
 * (gider) hem "geldi" (gelir) içerir. Bunun yerine tüm sinyaller
 * ağırlıklı toplanır ve fark yeterince büyükse karar verilir.
 *
 * ── BOŞ BIRAKMAK UYDURMAKTAN İYİDİR ──
 *
 * Skorlar yakınsa `kind` null döner ve onay kartı kullanıcıya sorar.
 * Yanlış bir tahmini sessizce kaydetmek, kullanıcının aylar sonra fark
 * edeceği bozuk veri üretir; sormak yalnızca bir saniye maliyetlidir.
 */
export function classifyIntent(rawText: string): IntentResult {
  const text = normalize(rawText);
  const warnings: string[] = [];

  // ── Transfer önce kontrol edilir ──
  // "hesabıma aktardım" hem "hesabıma" (gelir sinyali) hem transfer
  // içerir; transfer daha spesifik olduğu için öncelik onundur.
  const transferHit = matchesAny(text, TRANSFER_SIGNALS);
  if (transferHit) {
    return {
      kind: "transfer",
      confidence: 0.85,
      warnings,
      reason: transferHit,
    };
  }

  let incomeScore = 0;
  let expenseScore = 0;
  let reason: string | null = null;

  const incomeStrong = matchesAny(text, INCOME_STRONG);
  if (incomeStrong) {
    incomeScore += WEIGHT_STRONG;
    reason = incomeStrong;
  }
  const incomeWeak = matchesAny(text, INCOME_WEAK);
  if (incomeWeak) {
    incomeScore += WEIGHT_WEAK;
    reason ??= incomeWeak;
  }

  const expenseStrong = matchesAny(text, EXPENSE_STRONG);
  if (expenseStrong) {
    expenseScore += WEIGHT_STRONG;
    reason ??= expenseStrong;
  }
  const expenseWeak = matchesAny(text, EXPENSE_WEAK);
  if (expenseWeak) {
    expenseScore += WEIGHT_WEAK;
    reason ??= expenseWeak;
  }

  // ── ★ "aldım" belirsizliğinin çözümü ──
  //
  // Karar sırası: (1) nesne para akışını mı adlandırıyor, (2) cümlede
  // bir gider kategorisi geçiyor mu, (3) hiçbiri yoksa SORMA.
  if (hasAmbiguousVerb(text)) {
    const objectHit = matchesAny(text, INCOME_OBJECTS);
    if (objectHit) {
      // "maaşımı aldım" / "paramı aldım" → gelir.
      // Ağırlık yüksek: nesne, diğer zayıf sinyalleri bastırmalı.
      incomeScore += WEIGHT_OBJECT;
      reason = `aldım + ${objectHit}`;
    } else if (hasExpenseCategorySignal(text)) {
      // "200 tl yemek aldım" → "yemek" bir gider kategorisi, yani
      // satın alma. Kategori sinyali burada fiilin yönünü belirler.
      expenseScore += WEIGHT_OBJECT;
      reason = "aldım + gider kategorisi";
    } else if (hasIncomeCategorySignal(text)) {
      incomeScore += WEIGHT_OBJECT;
      reason = "aldım + gelir kategorisi";
    } else if (expenseScore === 0 && incomeScore === 0) {
      // Nesnesiz, kategorisiz yalın "aldım": hiçbir yön sinyali yok.
      // Uydurmak yerine sor.
      warnings.push(
        "\"aldım\" hem gelir hem gider olabilir — gelir mi gider mi seçin.",
      );
      return { kind: null, confidence: 0.25, warnings, reason: null };
    }
  }

  // ── FİİLSİZ CÜMLE: kategori tek başına yön verir ──
  //
  // Konuşma dilinde harcama çoğu zaman fiilsiz bildirilir:
  // "yüz elli tl taksi", "netflix aboneliği 250 tl", "300 tl market".
  // Fiil beklemek bu cümlelerin hepsini kullanıcıya sordururdu ve
  // dikte "her seferinde düzeltiyorum" hissine düşerdi.
  //
  // Güven bilinçli olarak orta seviyede: kategori güçlü bir ipucu ama
  // fiil kadar kesin değil. Onay kartı yine de türü vurgular.
  if (incomeScore === 0 && expenseScore === 0) {
    if (hasExpenseCategorySignal(text)) {
      return {
        kind: "expense",
        confidence: 0.7,
        warnings,
        reason: "gider kategorisi (fiil yok)",
      };
    }
    if (hasIncomeCategorySignal(text)) {
      return {
        kind: "income",
        confidence: 0.7,
        warnings,
        reason: "gelir kategorisi (fiil yok)",
      };
    }
  }

  const total = incomeScore + expenseScore;
  if (total === 0) {
    warnings.push("Gelir mi gider mi anlaşılamadı.");
    return { kind: null, confidence: 0, warnings, reason: null };
  }

  const diff = Math.abs(incomeScore - expenseScore);
  // Skorlar eşitse karar verilemez — ikisi de aynı güçte sinyal verdi.
  if (diff === 0) {
    warnings.push("Cümlede hem gelir hem gider işareti var — birini seçin.");
    return { kind: null, confidence: 0.3, warnings, reason };
  }

  const kind: IntentKind = incomeScore > expenseScore ? "income" : "expense";

  // Güven: kazananın toplam içindeki payı. Tek güçlü sinyal → ~1.0,
  // çekişmeli sinyaller → 0.5'e yakın.
  const winner = Math.max(incomeScore, expenseScore);
  const confidence = Math.min(1, winner / total);

  return { kind, confidence, warnings, reason };
}
