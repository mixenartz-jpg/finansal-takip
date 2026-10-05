import { describe, test, expect } from "vitest";
import {
  isTheme,
  resolveTheme,
  readStoredTheme,
  applyTheme,
  THEME_STORAGE_KEY,
  THEME_SCRIPT,
} from "./theme";

describe("isTheme", () => {
  test("geçerli değerleri tanır", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(true);
  });

  test("geçersiz değerleri reddeder", () => {
    expect(isTheme("koyu")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(42)).toBe(false);
  });
});

describe("resolveTheme", () => {
  test("açık ve koyu seçimler sistem tercihini yok sayar", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("sistem seçimi tercihi izler", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("readStoredTheme", () => {
  test("kayıtlı geçerli değeri döndürür", () => {
    expect(readStoredTheme({ getItem: () => "dark" })).toBe("dark");
  });

  test("kayıt yoksa system döner", () => {
    expect(readStoredTheme({ getItem: () => null })).toBe("system");
  });

  test("bozuk değerde system döner", () => {
    // localStorage kullanıcı tarafından elle düzenlenebilir;
    // bozuk değer uygulamayı kırmamalı.
    expect(readStoredTheme({ getItem: () => "{bozuk}" })).toBe("system");
  });

  test("getItem fırlatırsa system döner", () => {
    // Gizli sekmede veya site verisi engelliyken localStorage
    // erişimi istisna atar.
    const storage = {
      getItem: () => {
        throw new Error("engellendi");
      },
    };
    expect(readStoredTheme(storage)).toBe("system");
  });
});

describe("applyTheme", () => {
  /**
   * Vitest `environment: "node"` kullanıyor — DOM YOK ve bu bilinçli
   * bir seçim (bkz. vitest.config.mts). Bu yüzden `applyTheme` gerçek
   * bir HTMLElement değil, ihtiyacı olan metotları taşıyan sahte bir
   * nesneyle test ediliyor. jsdom kurmak tüm test takımını yavaşlatır
   * ve tek bir fonksiyon için bedeli ağır.
   */
  function fakeRoot() {
    const attrs = new Map<string, string>();
    return {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
      getAttribute: (k: string) => attrs.get(k) ?? null,
      hasAttribute: (k: string) => attrs.has(k),
    };
  }

  test("açık ve koyu için data-theme yazar", () => {
    const root = fakeRoot();
    applyTheme("dark", root);
    expect(root.getAttribute("data-theme")).toBe("dark");
    applyTheme("light", root);
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  test("system seçiminde data-theme KALDIRILIR", () => {
    // Öznitelik kalsaydı CSS'teki @media bloğu devre dışı kalır ve
    // sistem tercihi değiştiğinde sayfa tepki vermezdi.
    const root = fakeRoot();
    applyTheme("dark", root);
    applyTheme("system", root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
});

describe("THEME_SCRIPT", () => {
  test("depolama anahtarını içerir", () => {
    expect(THEME_SCRIPT).toContain(THEME_STORAGE_KEY);
  });

  test("try/catch ile sarılı", () => {
    // Script <head>'de senkron çalışır; bir istisna sayfanın geri
    // kalanının çizilmesini engellerdi.
    expect(THEME_SCRIPT).toContain("try");
    expect(THEME_SCRIPT).toContain("catch");
  });

  test("kapanış script etiketi içermez", () => {
    // dangerouslySetInnerHTML ile gömülüyor; "</script>" dizesi
    // etiketi erken kapatır ve sayfayı bozar.
    expect(THEME_SCRIPT).not.toContain("</script>");
  });
});
