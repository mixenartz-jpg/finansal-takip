"use client";

import { useId, useState } from "react";
import { formatTRYCompact } from "@/lib/money/money";
import { formatShortDate } from "@/lib/ui/tr";
import type { BalancePoint } from "./aggregate";

/**
 * Nakit akışı — kümülatif bakiye çizgisi.
 *
 * ── ELLE SVG, GRAFİK KÜTÜPHANESİ YOK ──
 *
 * Tek serili bir çizgi için 50 KB'lık bir kütüphane taşımak, bu
 * uygulamanın performans bütçesiyle çelişir. Ayrıca kütüphane
 * varsayılanları (renkli ızgara, gölgeli tooltip, animasyonlu
 * giriş) tasarım sistemiyle çatışır ve her birini ezmek, sıfırdan
 * yazmaktan uzun sürer.
 *
 * ── TEK EKSEN ──
 *
 * Çift eksen (bakiye + günlük akış aynı grafikte) YASAK: iki farklı
 * ölçek aynı çizim alanında kıyaslanamaz ve okuyucuyu yanıltır.
 * Günlük gelir/gider ayrı bir görselin işi.
 */

interface CashflowChartProps {
  points: readonly BalancePoint[];
}

const VIEW_W = 720;
const VIEW_H = 200;
const PAD_X = 8;
const PAD_Y = 16;

export function CashflowChart({ points }: CashflowChartProps) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-[var(--ink-3)]">
        Grafik için en az iki günlük veri gerekiyor.
      </p>
    );
  }

  const values = points.map((p) => p.balanceKurus);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  // Tamamen düz bir seride (min === max) sıfıra bölmeyi önle.
  const span = max - min || 1;

  const x = (i: number) =>
    PAD_X + (i / (points.length - 1)) * (VIEW_W - PAD_X * 2);
  const y = (v: number) =>
    PAD_Y + (1 - (v - min) / span) * (VIEW_H - PAD_Y * 2);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.balanceKurus).toFixed(1)}`)
    .join(" ");

  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${y(min)} L ${x(0).toFixed(1)} ${y(min)} Z`;

  // Sıfır çizgisi yalnızca seri negatife giriyorsa anlamlı.
  const showZeroLine = min < 0 && max > 0;
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full"
          role="img"
          aria-label="Bakiye değişimi grafiği"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.14" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {showZeroLine && (
            <line
              x1={PAD_X}
              y1={y(0)}
              x2={VIEW_W - PAD_X}
              y2={y(0)}
              stroke="var(--border-strong)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {active && hover !== null && (
            <>
              <line
                x1={x(hover)}
                y1={PAD_Y}
                x2={x(hover)}
                y2={VIEW_H - PAD_Y}
                stroke="var(--border-strong)"
                strokeWidth="1"
              />
              <circle
                cx={x(hover)}
                cy={y(active.balanceKurus)}
                r="4"
                fill="var(--brand)"
                stroke="var(--bg)"
                strokeWidth="2"
              />
            </>
          )}

          {/* Görünmez isabet şeritleri: nokta işaretinden geniş,
              böylece fare/parmak tam noktayı bulmak zorunda kalmaz. */}
          {points.map((p, i) => (
            <rect
              key={p.date}
              x={x(i) - (VIEW_W - PAD_X * 2) / (points.length - 1) / 2}
              y={0}
              width={(VIEW_W - PAD_X * 2) / (points.length - 1)}
              height={VIEW_H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>

        {/* Tooltip SVG DIŞINDA: HTML metni her zaman doğru
            ölçeklenir, SVG içindeki <text> viewBox ile birlikte
            esner ve küçük ekranda okunmaz olur. */}
        {active && (
          <div
            className="pointer-events-none absolute top-0 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[13px] shadow-sm"
            style={{
              // ── KENARLARDA HİZA DEĞİŞİR ──
              //
              // Ortalanmış bir tooltip ilk/son noktada yarı yarıya
              // kutunun dışına taşar. Uçlarda hizayı çevirmek
              // taşmayı engeller: solda sola yaslanır, sağda sağa.
              ...tooltipPosition(x(hover as number)),
            }}
          >
            <div className="text-[var(--ink-3)]">{formatShortDate(active.date)}</div>
            <div className="tnum font-medium text-[var(--ink)]">
              {formatTRYCompact(active.balanceKurus)}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between text-[13px] text-[var(--ink-3)]">
        <span>{formatShortDate(points[0].date)}</span>
        <span>{formatShortDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

/**
 * Tooltip'in yatay konumu ve hizası.
 *
 * Grafiğin ilk %15'inde sola, son %15'inde sağa yaslanır; arada
 * ortalanır. Ortalama her yerde uygulansaydı uçlardaki tooltip
 * kutunun yarısı kadar dışarı taşardı.
 */
function tooltipPosition(px: number): React.CSSProperties {
  const ratio = px / VIEW_W;

  if (ratio < 0.15) {
    return { left: 0, transform: "none" };
  }
  if (ratio > 0.85) {
    return { right: 0, transform: "none" };
  }
  return { left: `${ratio * 100}%`, transform: "translateX(-50%)" };
}
