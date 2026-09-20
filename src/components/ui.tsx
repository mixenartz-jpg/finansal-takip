"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/**
 * Paylaşılan arayüz bileşenleri.
 *
 * ── TEK KELİME DAĞARCIĞI ──
 *
 * Product register'ın kuralı: aynı iş her ekranda aynı görünmeli.
 * "Kaydet" butonu iki yerde farklı duruyorsa biri yanlıştır. Bu
 * dosya o dağarcığın tek kaynağı.
 *
 * Her etkileşimli bileşen şu durumları taşır: default, hover, focus,
 * active, disabled. Yarısını taşıyan bileşen bitmemiş sayılır.
 */

function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ─────────────────────────────── Button ──────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  full?: boolean;
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--r-md)] " +
  "px-3.5 h-9 text-sm font-medium whitespace-nowrap " +
  "transition-[background-color,border-color,color,opacity] " +
  "duration-[var(--dur-fast)] ease-[var(--ease)] " +
  "disabled:opacity-50 disabled:pointer-events-none";

/**
 * Varyant stilleri.
 *
 * Kenarlık VEYA gölge — ikisi birden değil. "1px kenarlık + geniş
 * yumuşak gölge" kombinasyonu bu kod tabanında yasak: hayalet kart
 * görüntüsü üretir ve hiçbir marka bunu istemez.
 */
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--brand)] text-[var(--on-brand)] hover:bg-[var(--brand-hover)] active:bg-[var(--brand-hover)]",
  secondary:
    "bg-[var(--bg)] text-[var(--ink)] border border-[var(--border-strong)] " +
    "hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]",
  ghost:
    "bg-transparent text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
  danger:
    "bg-[var(--danger)] text-[var(--on-danger)] hover:opacity-90 active:opacity-90",
};

export function Button({
  variant = "secondary",
  loading = false,
  full = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], full && "w-full", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin"
    />
  );
}

// ──────────────────────────────── Field ──────────────────────────────

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--ink)]">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-[var(--ink-3)]">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  "w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] text-[var(--ink)] " +
  "border border-[var(--border-strong)] " +
  "placeholder:text-[var(--ink-3)] " +
  "transition-[border-color] duration-[var(--dur-fast)] " +
  "hover:border-[var(--ink-3)] " +
  "disabled:opacity-50 disabled:bg-[var(--surface-2)]";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL_BASE, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL_BASE, "pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

// ──────────────────────────────── Card ───────────────────────────────

/**
 * Yüzey kartı — kenarlıkla ayrılır, gölgeyle değil.
 *
 * Açık temada gölge zayıf ve bulanıktır; kenarlık net bir sınır
 * çizer. İkisini birden kullanmak hayalet kart görünümü verir.
 */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ────────────────────────────── EmptyState ───────────────────────────

/**
 * Boş durum — arayüzü ÖĞRETİR, "kayıt yok" demez.
 *
 * Kullanıcının ilk gördüğü ekran genelde boş ekrandır; oraya ne
 * yazdığın uygulamanın ne olduğunu anlatan tek şey olabilir.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-[15px] font-medium text-[var(--ink)]">{title}</p>
      <p className="max-w-[46ch] text-sm text-[var(--ink-3)]">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ─────────────────────────────── Skeleton ────────────────────────────

/** Yükleniyor iskeleti — içeriğin ortasında dönen çark değil. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[var(--r-sm)] bg-[var(--surface-2)]", className)}
    />
  );
}

// ──────────────────────────────── Badge ──────────────────────────────

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "income" | "expense" | "warning" | "brand";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-[var(--surface-2)] text-[var(--ink-2)]",
    income: "bg-[var(--income-soft)] text-[var(--income)]",
    expense: "bg-[var(--expense-soft)] text-[var(--expense)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
    brand: "bg-[var(--brand-soft)] text-[var(--brand-ink)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--r-full)] px-2 py-0.5 text-[12px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
