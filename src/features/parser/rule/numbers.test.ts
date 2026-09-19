import { describe, test, expect } from "vitest";
import { parseNumberWords, parseDigitNumber, findAmount } from "./numbers";

describe("parseDigitNumber -- rakamla yazilmis sayilar", () => {
  test("duz tam sayi", () => {
    expect(parseDigitNumber("200")).toBe(200);
  });
  test("binlik ayracli sayi", () => {
    expect(parseDigitNumber("40.000")).toBe(40000);
  });
  test("cok basamakli binlik gruplari", () => {
    expect(parseDigitNumber("1.234.567")).toBe(1234567);
  });
  test("ondalikli sayi -- virgul ondalik", () => {
    expect(parseDigitNumber("1.250,50")).toBe(1250.5);
  });
  test("noktali ondalik da kabul edilir", () => {
    expect(parseDigitNumber("1250.50")).toBe(1250.5);
  });
  test("sayi olmayan girdide null", () => {
    expect(parseDigitNumber("abc")).toBeNull();
  });
  test("bozuk gruplamada null", () => {
    expect(parseDigitNumber("1.23.456")).toBeNull();
  });
});

describe("parseNumberWords -- yaziyla yazilmis sayilar", () => {
  test("tek birim", () => {
    expect(parseNumberWords(["bes"])).toBe(5);
  });
  test("on katlari + birim", () => {
    expect(parseNumberWords(["kirk", "bes"])).toBe(45);
  });
  test("kirk bin", () => {
    expect(parseNumberWords(["kirk", "bin"])).toBe(40000);
  });
  test("yuz elli", () => {
    expect(parseNumberWords(["yuz", "elli"])).toBe(150);
  });
  test("tek basina yuz = 100", () => {
    expect(parseNumberWords(["yuz"])).toBe(100);
  });
  test("tek basina bin = 1000", () => {
    expect(parseNumberWords(["bin"])).toBe(1000);
  });
  test("iki yuz elli", () => {
    expect(parseNumberWords(["iki", "yuz", "elli"])).toBe(250);
  });
  test("bin iki yuz elli", () => {
    expect(parseNumberWords(["bin", "iki", "yuz", "elli"])).toBe(1250);
  });
  test("iki bin yirmi bes", () => {
    expect(parseNumberWords(["iki", "bin", "yirmi", "bes"])).toBe(2025);
  });
  test("bir milyon", () => {
    expect(parseNumberWords(["bir", "milyon"])).toBe(1000000);
  });
  test("iki milyon bes yuz bin", () => {
    expect(parseNumberWords(["iki", "milyon", "bes", "yuz", "bin"])).toBe(2500000);
  });
  test("yuz yirmi bes bin", () => {
    expect(parseNumberWords(["yuz", "yirmi", "bes", "bin"])).toBe(125000);
  });
  test("bucuk yarim birim ekler", () => {
    expect(parseNumberWords(["iki", "bucuk"])).toBe(2.5);
  });
  test("iki bucuk milyon", () => {
    expect(parseNumberWords(["iki", "bucuk", "milyon"])).toBe(2500000);
  });
  test("bos listede null", () => {
    expect(parseNumberWords([])).toBeNull();
  });
  test("sayi olmayan kelimede null", () => {
    expect(parseNumberWords(["yemek"])).toBeNull();
  });
});

describe("findAmount -- cumleden tutar cikarma", () => {
  test("rakam + tl", () => {
    const r = findAmount("200 tl yemek aldim");
    expect(r?.kurus).toBe(20000);
  });
  test("rakam + lira", () => {
    expect(findAmount("350 lira verdim")?.kurus).toBe(35000);
  });
  test("binlik ayracli + tl", () => {
    expect(findAmount("bugun 40.000 tl para geldi")?.kurus).toBe(4000000);
  });
  test("ondalikli + tl", () => {
    expect(findAmount("kartla 1.250,50 tl fatura odedim")?.kurus).toBe(125050);
  });
  test("yaziyla + lira", () => {
    expect(findAmount("kirk bin lira maas yatti")?.kurus).toBe(4000000);
  });
  test("yaziyla + tl", () => {
    expect(findAmount("yuz elli tl taksi")?.kurus).toBe(15000);
  });
  test("tl simgesi ile", () => {
    expect(findAmount("200₺ market")?.kurus).toBe(20000);
  });
  test("para birimi olmadan da rakami bulur", () => {
    expect(findAmount("markete 350 harcadim")?.kurus).toBe(35000);
  });
  test("para birimi olan aday, olmayana tercih edilir", () => {
    // "5 dakika" tutar degil; "200 tl" tutar.
    expect(findAmount("5 dakika once 200 tl odedim")?.kurus).toBe(20000);
  });
  test("tutar yoksa null", () => {
    expect(findAmount("bugun hava guzel")).toBeNull();
  });
  test("span ham metindeki konumu isaret eder", () => {
    const r = findAmount("200 tl yemek aldim");
    expect(r?.span.start).toBe(0);
    expect("200 tl yemek aldim".slice(r!.span.start, r!.span.end)).toContain("200");
  });
  test("sifir tutar reddedilir -- 0 TL islem anlamsiz", () => {
    expect(findAmount("0 tl odedim")).toBeNull();
  });
  test("tarih gibi gorunen sayiyi tutar sanmaz", () => {
    // "15 mart" tarihtir; tutar degil.
    expect(findAmount("15 mart gunu")).toBeNull();
  });
  test("saat ifadesini tutar sanmaz", () => {
    expect(findAmount("saat 14 te bulustuk")).toBeNull();
  });
});
