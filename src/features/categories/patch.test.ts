import { describe, test, expect } from "vitest";
import { parseKeywords } from "./types";

describe("parseKeywords", () => {
  test("virgülle ayrılmış kelimeleri diziye çevirir", () => {
    expect(parseKeywords("migros, bim, a101")).toEqual(["migros", "bim", "a101"]);
  });

  test("boşlukları kırpar ve boşları atar", () => {
    expect(parseKeywords("  market ,, bakkal  ,  ")).toEqual(["market", "bakkal"]);
  });

  test("parser ile AYNI normalleştirmeyi uygular", () => {
    // `normalize()` İ/I/ı harflerinin hepsini "i"ye indirger ve
    // aksanları atar. Parser eşlemeyi bununla yapıyor
    // (rule/category.ts:70), bu yüzden kayıt da bununla yapılmalı.
    expect(parseKeywords("Migros, BİM, BIM")).toEqual(["migros", "bim"]);
  });

  test("aksanları ayıklar", () => {
    expect(parseKeywords("Süt, ÇAY")).toEqual(["sut", "cay"]);
  });

  test("yinelenenleri tekilleştirir", () => {
    // "BİM" ve "BIM" normalleştirmeden SONRA aynı kelimedir;
    // tekilleştirme normalleştirmenin ardından yapılmalı.
    expect(parseKeywords("market, Market, MARKET")).toEqual(["market"]);
  });

  test("boş girdi boş dizi verir", () => {
    expect(parseKeywords("")).toEqual([]);
    expect(parseKeywords("   ")).toEqual([]);
  });
});
