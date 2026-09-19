"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DictationSheet } from "@/features/dictation/DictationSheet";

/**
 * Uygulama kabuğu — üst başlık, gezinme ve sesli giriş erişimi.
 *
 * ── MOBİL ÖNCELİKLİ GEZİNME ──
 *
 * Dikte asıl telefonda kullanılacak. Gezinme altta sabit: başparmak
 * ekranın üstüne uzanmak zorunda kalmaz. Geniş ekranda aynı gezinme
 * üste taşınır (yan menü değil — yedi sayfası olmayan bir uygulamada
 * sidebar yer israfıdır).
 */

const NAV = [
  { href: "/", label: "Panel" },
  { href: "/islemler", label: "İşlemler" },
  { href: "/butce", label: "Bütçe" },
  { href: "/duzenli", label: "Düzenli" },
  { href: "/hesaplar", label: "Hesaplar" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [dictationOpen, setDictationOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <header className="sticky top-0 z-(--z-sticky) border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-[15px] font-semibold text-[var(--ink)]">
            Hesap Takip
          </Link>

          <nav aria-label="Ana gezinme" className="hidden gap-1 sm:flex">
            {NAV.map((item) => (
              <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-6 pb-28 sm:pb-12">{children}</main>

      {/* Mobil gezinme — altta, başparmak erişiminde. */}
      <nav
        aria-label="Ana gezinme"
        className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-t border-[var(--border)] bg-[var(--bg)] sm:hidden"
      >
        <div className="mx-auto flex max-w-3xl items-center justify-around px-2 py-2">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
        </div>
      </nav>

      {/* Sesli giriş — her ekrandan tek dokunuşla erişilir. Dikteyi
          bir alt sayfaya gömmek, onu "ana yol" olmaktan çıkarırdı. */}
      <button
        type="button"
        onClick={() => setDictationOpen(true)}
        aria-label="Sesli işlem ekle"
        className={[
          "fixed bottom-20 right-4 z-(--z-sticky) grid size-14 place-items-center",
          "rounded-full bg-[var(--brand)] text-white sm:bottom-6",
          "transition-colors duration-[var(--dur-fast)] hover:bg-[var(--brand-hover)]",
        ].join(" ")}
      >
        <svg
          width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </button>

      {dictationOpen && (
        <DictationOverlay onClose={() => setDictationOpen(false)} />
      )}
    </div>
  );
}

/**
 * Sesli giriş katmanı.
 *
 * Modal değil alt sayfa (sheet): telefonda ekranın altından açılır
 * ve tek elle kapatılabilir. Ortada beliren bir diyalog, mikrofon
 * düğmesini başparmaktan uzaklaştırırdı.
 */
function DictationOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-(--z-sheet)">
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--ink)]/20"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sesli işlem ekle"
        className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl rounded-t-[var(--r-lg)] border-t border-[var(--border)] bg-[var(--bg)] sm:inset-x-4 sm:bottom-4 sm:rounded-[var(--r-lg)] sm:border"
      >
        <DictationSheet onClose={onClose} />
      </div>
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-[var(--r-md)] px-3 py-1.5 text-sm font-medium",
        "transition-colors duration-[var(--dur-fast)]",
        active
          ? "bg-[var(--brand-soft)] text-[var(--brand-ink)]"
          : "text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}
