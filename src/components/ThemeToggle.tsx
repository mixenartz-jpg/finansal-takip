"use client";

import { useSyncExternalStore } from "react";
import { applyTheme, isTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/ui/theme";

/**
 * Tema geçişi — Açık / Koyu / Sistem.
 *
 * ── NEDEN ÜÇ DÜĞME, AÇ/KAPA DEĞİL ──
 *
 * İki durumlu bir anahtar "sistem" seçeneğini gizler ve kullanıcı
 * telefonunu akşam koyuya alınca uygulamanın onu izlemesini
 * sağlayamaz. Üç seçenek radyo grubu olarak sunuluyor çünkü
 * gerçekten üç dışlayıcı seçenek var.
 *
 * ── MONTAJDAN ÖNCE ÇİZİLMEZ ──
 *
 * Sunucuda `localStorage` yok. İlk render'da bir seçimi işaretli
 * göstermek, istemcide başka bir seçim çıkınca hidrasyon
 * uyuşmazlığı üretir. Sunucu anlık görüntüsü `null` döner ve
 * hidrasyon bitene kadar yer tutucu çizilir.
 *
 * ── DOĞRULUK KAYNAĞI: data-theme ÖZNİTELİĞİ ──
 *
 * Seçim `<html data-theme>`'dan okunur, `localStorage`'dan değil.
 * Flash önleyici script onu hidrasyondan önce yazıyor; `applyTheme`
 * de her seçimde güncelliyor. Gizli sekmede depolama yazılamasa
 * bile düğme gerçek görünümü gösterir.
 */

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return isTheme(attr) ? attr : "system";
}

function getServerSnapshot(): Theme | null {
  return null;
}

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Açık" },
  { value: "dark", label: "Koyu" },
  { value: "system", label: "Sistem" },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, getSnapshot, getServerSnapshot);

  function handleSelect(next: Theme) {
    applyTheme(next, document.documentElement);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Gizli sekmede yazma engellenebilir. Tema yine de bu oturum
      // için uygulandı; kalıcı olmaması kabul edilebilir.
    }
  }

  if (theme === null) {
    // Yer tutucu: düğme grubu sonradan belirince başlık zıplamasın.
    return <div className="h-8 w-[132px]" aria-hidden />;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Görünüm teması"
      className="flex shrink-0 items-center gap-0.5 rounded-[var(--r-md)] bg-[var(--surface-2)] p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => handleSelect(opt.value)}
            className={[
              "rounded-[var(--r-sm)] px-2 py-1 text-[13px] font-medium",
              "transition-colors duration-[var(--dur-fast)]",
              active
                ? "bg-[var(--bg)] text-[var(--ink)]"
                : "text-[var(--ink-3)] hover:text-[var(--ink)]",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
