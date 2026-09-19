import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Saf mantik testleri. `environment: "node"` bilincli bir secim:
 * test edilen her sey (parser, para aritmetigi, tarih hesabi) DOM'suz
 * ve senkron. jsdom kurmak testleri yavaslatir ve "tarayicida calisir"
 * yanilsamasi yaratir -- gercek tarayici dogrulamasi e2e'nin isi.
 *
 * include yalnizca `.ts`: `.tsx` bilincli olarak DISARIDA. Bilesen
 * testleri yazilmiyor cunku gorsel dogrulama Playwright'ta yapiliyor;
 * markup iddialari kirilgan ve tasarim degistikce yalanci alarm uretir.
 */
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/money/**/*.ts",
        "src/lib/date/**/*.ts",
        "src/lib/text/**/*.ts",
        "src/lib/db/**/*.ts",
        "src/features/parser/**/*.ts",
        "src/features/budgets/progress.ts",
        "src/features/recurring/occurrence.ts",
        "src/features/debts/remaining.ts",
        "src/features/reports/aggregate.ts",
        "src/features/reports/csv.ts",
      ],
      // Arayuz tanimlari ve veri sozlukleri: calistirilabilir dal yok,
      // kapsam yuzdesini sulandirirlar.
      exclude: ["**/types.ts", "**/*-lexicon.ts", "**/numbers-words.ts", "**/fixtures/**"],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
});
