/**
 * Tema durumu.
 *
 * ── ÜÇ DEĞER, İKİ GÖRÜNÜM ──
 *
 * Kullanıcı üç şey seçebilir (açık / koyu / sistem) ama ekranda iki
 * görünüm vardır. "system" bir görünüm DEĞİL, bir yönlendirmedir:
 * `data-theme` özniteliği kaldırılır ve CSS'teki
 * `prefers-color-scheme` bloğu devreye girer.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "hesap-takip-theme";

const THEMES: readonly string[] = ["light", "dark", "system"];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.includes(value);
}

/** Seçim + sistem tercihi → ekrandaki gerçek görünüm. */
export function resolveTheme(theme: Theme, prefersDark: boolean): "light" | "dark" {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

/**
 * Kayıtlı tercihi okur.
 *
 * `localStorage` gizli sekmede veya site verisi engellendiğinde
 * ERİŞİMDE istisna atar — okuma try/catch içinde. Bozuk değer de
 * varsayılana düşer: kullanıcı depolamayı elle düzenleyebilir.
 */
export function readStoredTheme(storage: Pick<Storage, "getItem">): Theme {
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

/**
 * `applyTheme`'in ihtiyaç duyduğu tek şey.
 *
 * `HTMLElement` yerine dar bir arayüz: testler DOM'suz node
 * ortamında çalışıyor (bkz. vitest.config.mts) ve tek bir fonksiyon
 * için jsdom kurmak tüm takımı yavaşlatırdı.
 */
export type ThemeTarget = Pick<HTMLElement, "setAttribute" | "removeAttribute">;

/**
 * Temayı köke uygular.
 *
 * "system" seçiminde öznitelik KALDIRILIR, "system" yazılmaz: CSS
 * `:root:not([data-theme="light"])` ile çalışıyor ve öznitelik kalsa
 * medya sorgusu beklendiği gibi davranmazdı.
 */
export function applyTheme(theme: Theme, root: ThemeTarget): void {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/**
 * <head>'de senkron çalışan flash önleyici script.
 *
 * ── NEDEN INLINE VE SENKRON ──
 *
 * React hidrasyonu beklenirse sayfa bir an AÇIK temada çizilir ve
 * koyu temaya geçerken beyaz parlar. Geceleyin telefonda bakan biri
 * için bu rahatsız edici. Script <head>'de, gövde çizilmeden önce
 * çalışmalı.
 *
 * Tek dize olarak tutuluyor çünkü `dangerouslySetInnerHTML` ile
 * gömülüyor; try/catch şart, çünkü burada atılan bir istisna
 * sayfanın geri kalanını durdurur.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
