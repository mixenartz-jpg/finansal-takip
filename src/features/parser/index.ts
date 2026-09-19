import type {
  TransactionParser,
  ParseContext,
  ParseResult,
} from "./types";
import { CONFIDENCE_THRESHOLD } from "./types";
import { RuleTransactionParser } from "./rule/rule-parser";

export type { TransactionParser, ParseContext, ParseResult } from "./types";
export { CONFIDENCE_THRESHOLD, EMPTY_DRAFT } from "./types";
export { RuleTransactionParser } from "./rule/rule-parser";

/**
 * Zincirli parser: önce kural motoru, güven düşükse yedek parser.
 *
 * ── GEMİNİ BURAYA TAKILIR ──
 *
 * Bugün `fallback` yok ve uygulama tam çalışıyor. Bir LLM parser
 * yazıldığında (örn. `llm/gemini-parser.ts`) tek yapılacak:
 *
 *   createParser({ fallback: new GeminiTransactionParser() })
 *
 * Bu sınıfta, kural motorunda ya da çağrı noktalarında hiçbir
 * değişiklik gerekmez. Arayüz (`TransactionParser`) sözleşme, bu
 * sınıf da o sözleşmenin tek uygulayıcısı.
 *
 * ── NEDEN YEDEK, BİRİNCİL DEĞİL ──
 *
 * Kural motoru ücretsiz, anlık ve çevrimdışı çalışır. Her cümle için
 * ağ çağrısı yapmak hem para hem gecikme demektir; kullanıcı mikrofona
 * konuşup bir saniye bekliyorsa dikte "hızlı" olma iddiasını kaybeder.
 * LLM yalnızca kural motorunun zorlandığı cümlelerde devreye girer.
 */
export class ChainedParser implements TransactionParser {
  readonly name = "chain";

  constructor(
    private readonly primary: TransactionParser,
    private readonly fallback: TransactionParser | null = null,
    private readonly threshold: number = CONFIDENCE_THRESHOLD,
  ) {}

  async parse(text: string, ctx: ParseContext): Promise<ParseResult> {
    const first = await this.primary.parse(text, ctx);

    if (!this.fallback || first.overall >= this.threshold) {
      return first;
    }

    try {
      const second = await this.fallback.parse(text, ctx);
      // Yedek daha iyi değilse birincil sonuç korunur: LLM'in daha
      // kötü bir tahmin üretmesi mümkün ve onu körlemesine tercih
      // etmek kural motorunun kesinliğini boşa harcar.
      return second.overall > first.overall ? second : first;
    } catch {
      // Ağ hatası, kota aşımı, geçersiz anahtar: dikte ÇALIŞMAYA
      // DEVAM ETMELİ. Yedek parser'ın başarısızlığı kullanıcının
      // işlem girmesini engellememeli.
      return {
        ...first,
        warnings: [
          ...first.warnings,
          "Yapay zeka desteği şu an kullanılamıyor, kural motoru sonucu gösteriliyor.",
        ],
      };
    }
  }
}

export interface CreateParserOptions {
  /** Kural motoru düşük güven verdiğinde devreye girecek parser. */
  fallback?: TransactionParser | null;
  threshold?: number;
}

/**
 * Uygulamanın kullandığı parser'ı kurar.
 *
 * Çağrı noktaları (dictation/) yalnızca bunu bilir; hangi parser'ların
 * zincirde olduğu burada kararlaştırılır.
 */
export function createParser(options: CreateParserOptions = {}): TransactionParser {
  const { fallback = null, threshold = CONFIDENCE_THRESHOLD } = options;
  return new ChainedParser(new RuleTransactionParser(), fallback, threshold);
}
