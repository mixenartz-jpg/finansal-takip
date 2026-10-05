import { describe, expect, test } from "vitest";
import { FOCUSABLE_SELECTOR, nextTrapFocus } from "./focus";

/**
 * Odak tuzağının KARAR mantığı.
 *
 * Testler `node` ortamında koşuyor (bkz. vitest.config.mts), o
 * yüzden burada gerçek DOM yok. `nextTrapFocus` bilerek saf: odak
 * verilebilir öğelerin listesini ve o an odakta olanı alır, sıradaki
 * öğenin İNDEKSİNİ söyler. Gerçek `focus()` çağrısını React tarafı
 * yapar. Böylece kenar durumlar jsdom kurmadan sınanabiliyor.
 */

describe("nextTrapFocus -- odak diyalogdan çıkmaz", () => {
  test("Tab son öğedeyken başa sarar", () => {
    expect(nextTrapFocus(2, 3, false)).toBe(0);
  });

  test("Shift+Tab ilk öğedeyken sona sarar", () => {
    expect(nextTrapFocus(0, 3, true)).toBe(2);
  });

  test("Tab ortadayken bir sonrakine geçer", () => {
    expect(nextTrapFocus(0, 3, false)).toBe(1);
  });

  test("Shift+Tab ortadayken bir öncekine geçer", () => {
    expect(nextTrapFocus(2, 3, true)).toBe(1);
  });

  /**
   * ── ODAK DIŞARIDAYKEN ──
   *
   * Kullanıcı diyalog açıkken adres çubuğuna gidip geri dönebilir;
   * o anda odakta olan öğe listede olmayabilir (-1). Tab dışarıdan
   * içeri ilk öğeye, Shift+Tab son öğeye düşmeli — yoksa odak
   * diyaloğun arkasındaki sayfada kaybolur.
   */
  test("odak listede değilken Tab ilk öğeye düşer", () => {
    expect(nextTrapFocus(-1, 3, false)).toBe(0);
  });

  test("odak listede değilken Shift+Tab son öğeye düşer", () => {
    expect(nextTrapFocus(-1, 3, true)).toBe(2);
  });

  test("tek odaklanabilir öğe varsa yerinde kalır", () => {
    expect(nextTrapFocus(0, 1, false)).toBe(0);
    expect(nextTrapFocus(0, 1, true)).toBe(0);
  });

  /**
   * Hiç odaklanabilir öğe yoksa yapacak bir şey yok. Çağıran taraf
   * `null` görünce olayı ezmez; aksi halde klavye tamamen kilitlenir.
   */
  test("odaklanabilir öğe yoksa null döner", () => {
    expect(nextTrapFocus(-1, 0, false)).toBeNull();
    expect(nextTrapFocus(-1, 0, true)).toBeNull();
  });
});

describe("FOCUSABLE_SELECTOR", () => {
  /**
   * `disabled` öğeler seçiciye girmemeli: kaydetme sırasında
   * butonlar kapanıyor (`loading`), o anda Tab devre dışı bir
   * butonda takılmamalı.
   */
  test("devre dışı öğeleri dışarıda bırakır", () => {
    expect(FOCUSABLE_SELECTOR).toContain(":not([disabled])");
  });

  /** `tabindex="-1"` programatik odak içindir, Tab sırasına girmez. */
  test('tabindex="-1" taşıyanları dışarıda bırakır', () => {
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex="-1"]');
  });

  test("form alanlarını ve bağlantıları kapsar", () => {
    for (const tag of ["button", "input", "select", "textarea", "a["]) {
      expect(FOCUSABLE_SELECTOR).toContain(tag);
    }
  });
});
