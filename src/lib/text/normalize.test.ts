import { describe, expect, test } from "vitest";
import { normalize } from "./normalize";

describe("normalize", () => {
  test("büyük İ ile küçük i eşleşir", () => {
    expect(normalize("İstanbul")).toBe(normalize("istanbul"));
  });

  test("noktasız ı ile i eşleşir", () => {
    expect(normalize("ışık")).toBe(normalize("isik"));
  });

  test("büyük I noktalı i'ye katlanır", () => {
    expect(normalize("IRMAK")).toBe(normalize("irmak"));
  });

  test("aksanlar atılır — kullanıcı aksan yazmak zorunda değil", () => {
    expect(normalize("süt")).toBe("sut");
    expect(normalize("öğrenci")).toBe("ogrenci");
    expect(normalize("çalışma")).toBe("calisma");
  });

  test("İ küçültmesi birleşen nokta bırakmaz", () => {
    // Asıl tuzak: toLowerCase("İ") "i" + U+0307 üretir ve düz "i" ile
    // eşleşmez. Çıktıda birleşen işaret kalmamalı.
    expect(normalize("İ")).toBe("i");
    expect(normalize("İ")).toHaveLength(1);
  });

  test("boş metin boş döner", () => {
    expect(normalize("")).toBe("");
  });

  test("idempotenttir", () => {
    const once = normalize("MATEMATİK · Türev");
    expect(normalize(once)).toBe(once);
  });
});
