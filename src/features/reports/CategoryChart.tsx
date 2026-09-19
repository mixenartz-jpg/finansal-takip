"use client";

import { useState } from "react";
import { formatTRYCompact } from "@/lib/money/money";
import type { CategorySlice } from "./aggregate";

/**
 * Kategori dağılımı — yatay bar, sequential (tek hue) rampa.
 *
 * ── NEDEN PASTA DEĞİL ──
 *
 * Pasta grafiğinde dilim açılarını karşılaştırmak, bar uzunluklarını
 * karşılaştırmaktan ölçülebilir biçimde zordur; 6 dilimde neredeyse
 * imkânsız. Ayrıca kategori adları Türkçe ve uzun ("Ulaşım",
 * "Eğlence") — yatay barda etiket doğal olarak okunur.
 *
 * ── NEDEN KATEGORİK PALET DEĞİL ──
 *
 * Burada renk KİMLİK taşımıyor, BÜYÜKLÜK taşıyor: dilimler zaten
 * büyükten küçüğe sıralı ve her biri adıyla etiketli. Sekiz ayrı
 * hue kullanmak hem gereksiz hem de renk körlüğünde ayırt
 * edilemeyen çiftler üretirdi. Tek hue, koyudan açığa.
 *
 * Rampanın altı adımı da beyaz zeminde ≥3:1 kontrast verir
 * (doğrulandı); en açık adım bile zeminden ayrılır.
 */

/**
 * Sequential rampa — marka hue'su (266), koyudan açığa.
 * Kontrast: 10.4 · 8.1 · 6.2 · 4.8 · 3.9 · 3.2 (hepsi ≥3:1)
 */
const RAMP = [
  "oklch(0.38 0.16 266)",
  "oklch(0.44 0.16 266)",
  "oklch(0.50 0.16 266)",
  "oklch(0.56 0.15 266)",
  "oklch(0.61 0.14 266)",
  "oklch(0.66 0.13 266)",
] as const;

interface CategoryChartProps {
  slices: readonly CategorySlice[];
  /** Erişilebilirlik ve doğrulama için tablo görünümü. */
  showTable?: boolean;
}

export function CategoryChart({ slices, showTable = false }: CategoryChartProps) {
  const [table, setTable] = useState(showTable);

  if (slices.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--ink-3)]">
        Bu dönemde işlem yok.
      </p>
    );
  }

  const max = Math.max(...slices.map((s) => s.totalKurus));

  return (
    <div className="flex flex-col gap-3">
      {table ? (
        <CategoryTable slices={slices} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {slices.map((s, i) => (
            <li key={`${s.categoryId ?? "other"}-${s.name}`} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-[var(--ink)]">{s.name}</span>
                <span className="tnum shrink-0 text-[13px] text-[var(--ink-2)]">
                  {formatTRYCompact(s.totalKurus)}
                  <span className="ml-1.5 text-[var(--ink-3)]">
                    %{s.percent.toFixed(0)}
                  </span>
                </span>
              </div>

              {/* Bar: en büyük dilime göre oranlanır, yüzdeye göre
                  değil. Yüzde kullanılsaydı tek kategorili bir ayda
                  bar tam genişlik olur ve hiçbir şey anlatmazdı. */}
              <div className="h-2 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-[var(--r-full)]"
                  style={{
                    width: `${(s.totalKurus / max) * 100}%`,
                    backgroundColor: RAMP[Math.min(i, RAMP.length - 1)],
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setTable((t) => !t)}
        className="self-start text-[13px] text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
      >
        {table ? "Grafik olarak göster" : "Tablo olarak göster"}
      </button>
    </div>
  );
}

/**
 * Tablo görünümü.
 *
 * Grafiğin alternatifi değil, EŞİDİ: ekran okuyucu kullanan ya da
 * kesin rakam isteyen kullanıcı için aynı veri. Erişilebilirlik
 * gereği olarak her grafiğin bir tablo karşılığı var.
 */
function CategoryTable({ slices }: { slices: readonly CategorySlice[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--border)] text-left">
          <th className="py-1.5 font-medium text-[var(--ink-3)]">Kategori</th>
          <th className="py-1.5 text-right font-medium text-[var(--ink-3)]">Tutar</th>
          <th className="py-1.5 text-right font-medium text-[var(--ink-3)]">Pay</th>
        </tr>
      </thead>
      <tbody>
        {slices.map((s) => (
          <tr
            key={`${s.categoryId ?? "other"}-${s.name}`}
            className="border-b border-[var(--border)] last:border-0"
          >
            <td className="py-1.5 text-[var(--ink)]">{s.name}</td>
            <td className="tnum py-1.5 text-right text-[var(--ink)]">
              {formatTRYCompact(s.totalKurus)}
            </td>
            <td className="tnum py-1.5 text-right text-[var(--ink-3)]">
              %{s.percent.toFixed(0)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
