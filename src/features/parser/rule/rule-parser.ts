import type {
  TransactionParser,
  ParseContext,
  ParseResult,
  DraftTransaction,
  FieldConfidence,
  DraftField,
  Span,
} from "../types";
import { findAmount } from "./numbers";
import { classifyIntent } from "./intent";
import { findCategory } from "./category";
import { findDate } from "./dates";
import { findAccount } from "./account";
import { buildNote } from "./note";

/**
 * Alan ağırlıkları — toplam güven hesabında.
 *
 * Tutar ve tür belirleyicidir: ikisi olmadan işlem kaydedilemez.
 * Kategori ve hesap eksikse işlem yine kaydedilebilir (kategorisiz
 * işleme şema izin veriyor), bu yüzden ağırlıkları düşük.
 */
const FIELD_WEIGHTS: Partial<Record<DraftField, number>> = {
  amountKurus: 0.4,
  kind: 0.35,
  categoryId: 0.15,
  date: 0.05,
  accountId: 0.05,
};

/**
 * Kural tabanlı Türkçe işlem ayrıştırıcı.
 *
 * Yapay zeka KULLANMAZ ve ağ çağrısı YAPMAZ. Tamamen yerel, senkron
 * ve deterministiktir; aynı cümle her zaman aynı sonucu verir. Bu,
 * test edilebilirliğin ve ilk günden çalışmanın karşılığı.
 *
 * Gemini gibi bir LLM parser eklendiğinde bu sınıf DEĞİŞMEZ: zincir
 * (index.ts) düşük güvenli sonuçlarda diğerine düşer.
 */
export class RuleTransactionParser implements TransactionParser {
  readonly name = "rule";

  async parse(text: string, ctx: ParseContext): Promise<ParseResult> {
    const warnings: string[] = [];
    const spans: Partial<Record<DraftField, Span>> = {};

    // ── Tür (gelir / gider / transfer) ──
    const intent = classifyIntent(text);
    warnings.push(...intent.warnings);

    // ── Tutar ──
    const amount = findAmount(text);
    if (!amount) {
      warnings.push("Tutar bulunamadı — elle girin.");
    } else {
      spans.amountKurus = amount.span;
      if (!amount.hasCurrency) {
        warnings.push("Para birimi söylenmedi, sayı tutar olarak alındı.");
      }
    }

    // ── Tarih ──
    const date = findDate(text, ctx.today);
    if (date.span) spans.date = date.span;

    // ── Kategori ──
    // Transferin kategorisi olmaz (SQL `transfer_shape` kısıtı) —
    // aramaya bile girilmez.
    const categoryKind =
      intent.kind === "income" || intent.kind === "expense" ? intent.kind : null;
    const category =
      intent.kind === "transfer"
        ? null
        : findCategory(text, ctx.categories, categoryKind);
    if (category?.span) spans.categoryId = category.span;

    // ── Hesap ──
    const account = findAccount(text, ctx.accounts, ctx.defaultAccountId);
    if (account?.span) spans.accountId = account.span;
    if (account && account.confidence <= 0.4 && ctx.accounts.length > 1) {
      warnings.push("Hangi hesap olduğu söylenmedi, varsayılan seçildi.");
    }

    // ── Açıklama ──
    const note = buildNote(text, Object.values(spans).filter(Boolean) as Span[]);

    const draft: DraftTransaction = {
      kind: intent.kind,
      amountKurus: amount?.kurus ?? null,
      date: date.date,
      categoryId: category?.categoryId ?? null,
      accountId: account?.accountId ?? null,
      counterAccountId: null,
      note,
    };

    const confidence: FieldConfidence = {
      kind: intent.kind ? intent.confidence : 0,
      amountKurus: amount ? (amount.hasCurrency ? 0.95 : 0.6) : 0,
      date: date.confidence,
      categoryId: category?.confidence ?? 0,
      accountId: account?.confidence ?? 0,
      counterAccountId: 0,
      note: note ? 0.5 : 0,
    };

    // Transfer hedef hesabı bu sürümde çıkarılmıyor: "A'dan B'ye"
    // kalıbını güvenilir ayırmak iki hesap adının da geçmesini
    // gerektirir ve yanlış tahmin para taşımayı bozar. Onay kartı
    // hedefi sorar.
    if (intent.kind === "transfer") {
      warnings.push("Transfer hedefi seçilmeli.");
    }

    return {
      draft,
      confidence,
      overall: computeOverall(confidence),
      spans,
      warnings,
      parserName: this.name,
    };
  }
}

/**
 * Ağırlıklı toplam güven.
 *
 * Basit ortalama YANLIŞ olurdu: kategori bulunamadığında (0 güven)
 * tutar ve tür %95 olsa bile ortalama düşer ve zincir gereksiz yere
 * LLM'e düşerdi. Ağırlıklandırma, gerçekten belirleyici alanların
 * kararı vermesini sağlar.
 */
export function computeOverall(confidence: FieldConfidence): number {
  let sum = 0;
  let totalWeight = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    sum += confidence[field as DraftField] * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : sum / totalWeight;
}
