"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { FOCUSABLE_SELECTOR, nextTrapFocus } from "@/lib/ui/focus";

/**
 * Alttan açılan kipli diyalog.
 *
 * ── NEDEN PAYLAŞILAN BİR BİLEŞEN ──
 *
 * İşlem, hesap ve kategori düzenleme sayfaları aynı işaretlemeyi
 * üç kez kopyalamıştı. Üçü de `aria-modal="true"` diyordu ama
 * üçünde de klavye desteği eksikti; bir düzeltme üç yerde
 * yapılmak zorunda kalacaktı.
 *
 * ── KİPLİ DİYALOĞUN KLAVYE BORCU ──
 *
 * `aria-modal="true"` ekran okuyucuya "arkamdaki her şey yok" der.
 * Tarayıcı bunu klavyede uygulamaz. Eksik kalan üç davranış:
 *
 *   1. Açılışta odak İÇERİ girmeli. Girmezse klavye kullanıcısı
 *      sayfanın tamamını dolaşmadan forma ulaşamaz.
 *   2. Tab diyaloğun içinde KALMALI. Kalmazsa odak, ekran
 *      okuyucunun "yok" saydığı arka plana kayar — çıkışsız durum.
 *   3. Kapanışta odak AÇAN ÖĞEYE dönmeli. Dönmezse odak belgenin
 *      başına düşer ve kullanıcı yerini kaybeder.
 *
 * Escape de burada: fare kullanmayan biri için tek çıkış yolu
 * arka plana tıklamak olmamalı.
 */
interface SheetProps {
  /** Ekran okuyucunun diyaloğu tanıttığı ad. */
  label: string;
  onClose: () => void;
  /**
   * Panelin iç boşluğu. Düzenleme formları `p-4` ister; dikte
   * katmanı kendi iç boşluğunu taşıdığı için `false` geçer.
   */
  padded?: boolean;
  children: ReactNode;
}

export function Sheet({ label, onClose, padded = true, children }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);

  /*
   * `onClose` her render'da yeni bir fonksiyon olabilir. Efektin
   * bağımlılığına konsa dinleyici her render'da sökülüp takılırdı;
   * ref'te tutmak hem güncel değeri hem tek kurulumu verir.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const node = panel.current;
    if (!node) return;

    // Açan öğe: kapanışta odak buraya dönecek. Diyalog açıldığı
    // anda odakta olan şey, ona tıklayan/Enter'layan düğmedir.
    const opener = document.activeElement as HTMLElement | null;

    const focusable = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    /*
     * Odak ilk alana değil, PANELİN KENDİSİNE veriliyor
     * (`tabIndex={-1}`). Böylece ekran okuyucu önce diyaloğun adını
     * okur; doğrudan alana atlansaydı kullanıcı nereye düştüğünü
     * duymadan yazmaya başlardı.
     */
    node.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const items = focusable();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = nextTrapFocus(current, items.length, event.shiftKey);

      // Odaklanabilir hiçbir şey yoksa olayı EZME: tarayıcının
      // kendi davranışı, klavyeyi tamamen kilitlemekten iyidir.
      if (next === null) return;

      event.preventDefault();
      items[next].focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Açan öğe bu arada DOM'dan kalkmış olabilir (listedeki satır
      // silindiyse); `isConnected` kontrolü olmadan odak hiçliğe gider.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-(--z-sheet)">
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--ink)]/20"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={[
          "absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-3xl overflow-y-auto",
          "rounded-t-[var(--r-lg)] border-t border-[var(--border)] bg-[var(--bg)] outline-none",
          "sm:inset-x-4 sm:bottom-4 sm:rounded-[var(--r-lg)] sm:border",
          padded ? "p-4" : "",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
