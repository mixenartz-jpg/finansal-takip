import { describe, test, expect, vi, afterEach } from "vitest";
import { toUserMessage, toUserError } from "./errors";

afterEach(() => vi.restoreAllMocks());

describe("toUserMessage -- tanidik kisit ihlalleri cevrilir", () => {
  const cases: [string, RegExp][] = [
    ['violates check constraint "transfer_shape"', /hedef hesap/i],
    ['new row violates check constraint "transactions_amount_kurus_check"', /sıfırdan büyük/i],
    ["Kategori türü işlem türüyle uyuşmuyor: income / expense", /uyuşmuyor/i],
    ['violates foreign key constraint "transactions_account_same_owner"', /bulunamadı/i],
    ['duplicate key value violates unique constraint', /zaten var/i],
    ['violates check constraint "credit_limit_only_on_card"', /kredi kartı/i],
  ];
  for (const [raw, expected] of cases) {
    test(`"${raw.slice(0, 40)}..." cevrilir`, () => {
      expect(toUserMessage({ message: raw })).toMatch(expected);
    });
  }
});

describe("toUserMessage -- ag/oturum hatalari", () => {
  test("JWT hatasi yeniden giris onerir", () => {
    expect(toUserMessage({ message: "JWT expired" })).toMatch(/giriş/i);
  });
  test("ag hatasi baglanti kontrolu onerir", () => {
    expect(toUserMessage({ message: "Failed to fetch" })).toMatch(/bağlantı/i);
  });
  test("RLS reddi erisim izni mesaji verir", () => {
    expect(toUserMessage({ message: 'new row violates row-level security policy' })).toMatch(/izniniz yok/i);
  });
});

describe("toUserMessage -- ★ tanınmayan hata sema ayrintisi SIZDIRMAZ", () => {
  const leaky = [
    'relation "transactions" does not exist',
    'column accounts.secret_column does not exist',
    'index "idx_users_internal" is corrupt',
    'permission denied for schema pg_catalog',
  ];

  for (const raw of leaky) {
    test(`"${raw.slice(0, 35)}..." ham metni kullaniciya gitmez`, () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const msg = toUserMessage({ message: raw });
      // Ham mesajin hicbir parcasi kullaniciya gosterilen metinde olmamali.
      expect(msg).not.toContain(raw);
      for (const word of ["relation", "column", "index", "pg_catalog", "schema"]) {
        expect(msg.toLowerCase()).not.toContain(word);
      }
    });
  }

  test("baglam verilirse kullaniciya anlamli mesaj doner", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const msg = toUserMessage({ message: 'relation "x" does not exist' }, "İşlem kaydedilemedi");
    expect(msg).toContain("İşlem kaydedilemedi");
    expect(msg).toMatch(/tekrar deneyin/i);
  });

  test("baglam yoksa genel mesaj doner", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toUserMessage({ message: "bilinmeyen" })).toMatch(/tekrar deneyin/i);
  });

  test("tanınmayan hata gelistirici konsoluna yazilir", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    toUserMessage({ message: 'relation "gizli_tablo" does not exist' });
    expect(spy).toHaveBeenCalled();
    // Ayrinti KONSOLA gider -- kaybolmaz, sadece kullaniciya gitmez.
    expect(String(spy.mock.calls[0][0])).toContain("gizli_tablo");
  });

  test("tanidik hatada konsola yazilmaz -- gurultu uretmez", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    toUserMessage({ message: 'violates check constraint "transfer_shape"' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("toUserError", () => {
  test("Error nesnesi doner", () => {
    const e = toUserError({ message: 'violates check constraint "transfer_shape"' });
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toMatch(/hedef hesap/i);
  });
});
