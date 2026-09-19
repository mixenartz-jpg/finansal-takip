import { describe, test, expect } from "vitest";
import {
  asKurus, liraToKurus, kurusToLira, addKurus, subKurus, sumKurus,
  negateKurus, formatTRY, formatTRYCompact, formatTRYSigned,
  parseTRYInput, percentOf, ZERO_KURUS,
} from "./money";

describe("asKurus", () => {
  test("tam sayiyi Kurus olarak kabul eder", () => {
    expect(asKurus(20000)).toBe(20000);
  });
  test("sifiri kabul eder", () => {
    expect(asKurus(0)).toBe(0);
  });
  test("negatif tam sayiyi kabul eder (kredi karti bakiyesi negatif olabilir)", () => {
    expect(asKurus(-5000)).toBe(-5000);
  });
  test("ondalikli sayida firlatir -- kurus bolunmez", () => {
    expect(() => asKurus(200.5)).toThrow(/tam sayı/i);
  });
  test("NaN'da firlatir", () => {
    expect(() => asKurus(NaN)).toThrow();
  });
  test("guvenli tam sayi sinirini asinca firlatir", () => {
    expect(() => asKurus(Number.MAX_SAFE_INTEGER + 2)).toThrow();
  });
});

describe("liraToKurus", () => {
  test("tam lirayi kurusa cevirir", () => {
    expect(liraToKurus(200)).toBe(20000);
  });
  test("kuruslu tutari yuvarlar", () => {
    expect(liraToKurus(1234.56)).toBe(123456);
  });
  test("float kayma uretmez -- 0.1+0.2 tuzagi", () => {
    // 0.1 + 0.2 = 0.30000000000000004; naif *100 -> 30.000000000000004
    expect(liraToKurus(0.1 + 0.2)).toBe(30);
  });
  test("ucuncu ondaligi yuvarlar", () => {
    expect(liraToKurus(10.999)).toBe(1100);
  });
});

describe("kurusToLira", () => {
  test("kurusu liraya cevirir", () => {
    expect(kurusToLira(asKurus(123456))).toBe(1234.56);
  });
});

describe("aritmetik", () => {
  test("addKurus toplar", () => {
    expect(addKurus(asKurus(20000), asKurus(5000))).toBe(25000);
  });
  test("subKurus cikarir", () => {
    expect(subKurus(asKurus(20000), asKurus(5000))).toBe(15000);
  });
  test("sumKurus listeyi toplar", () => {
    expect(sumKurus([asKurus(100), asKurus(250), asKurus(3)])).toBe(353);
  });
  test("sumKurus bos listede sifir doner", () => {
    expect(sumKurus([])).toBe(0);
  });
  test("negateKurus isareti cevirir", () => {
    expect(negateKurus(asKurus(20000))).toBe(-20000);
  });
  test("tekrarlanan toplama kayma biriktirmez", () => {
    // Lira tarafinda 0.1'i 10 kez toplamak 0.9999999999999999 verir.
    const onKurus = asKurus(10);
    let acc = ZERO_KURUS;
    for (let i = 0; i < 10; i++) acc = addKurus(acc, onKurus);
    expect(acc).toBe(100);
  });
});

describe("formatTRY", () => {
  test("binlik ayraci nokta, ondalik virgul", () => {
    expect(formatTRY(asKurus(123456))).toBe("1.234,56 ₺");
  });
  test("kurus sifir olsa da iki hane gosterir", () => {
    expect(formatTRY(asKurus(20000))).toBe("200,00 ₺");
  });
  test("sifiri gosterir", () => {
    expect(formatTRY(ZERO_KURUS)).toBe("0,00 ₺");
  });
});

describe("formatTRYCompact", () => {
  test("kurus sifirsa kurusu gizler", () => {
    expect(formatTRYCompact(asKurus(4000000))).toBe("40.000 ₺");
  });
  test("kurus varsa gosterir", () => {
    expect(formatTRYCompact(asKurus(123456))).toBe("1.234,56 ₺");
  });
});

describe("formatTRYSigned", () => {
  test("gelir basina arti koyar", () => {
    expect(formatTRYSigned(asKurus(4000000), "income")).toBe("+40.000 ₺");
  });
  test("gider basina GERCEK eksi isareti koyar (U+2212, kisa cizgi degil)", () => {
    const out = formatTRYSigned(asKurus(20000), "expense");
    expect(out).toBe("\u2212200 ₺");
    expect(out.startsWith("-")).toBe(false);
  });
  test("transfer isaretsiz gosterilir -- ne gelir ne gider", () => {
    expect(formatTRYSigned(asKurus(20000), "transfer")).toBe("200 ₺");
  });
});

describe("parseTRYInput", () => {
  test("TR formatini ayristirir: binlik nokta, ondalik virgul", () => {
    expect(parseTRYInput("1.234,56")).toBe(123456);
  });
  test("sadece virgullu ondaligi ayristirir", () => {
    expect(parseTRYInput("1234,56")).toBe(123456);
  });
  test("noktali ondaligi da kabul eder -- klavyeden nokta yazmak yaygin", () => {
    expect(parseTRYInput("1234.56")).toBe(123456);
  });
  test("duz tam sayiyi ayristirir", () => {
    expect(parseTRYInput("1234")).toBe(123400);
  });
  test("binlik ayracli tam sayiyi ayristirir", () => {
    expect(parseTRYInput("40.000")).toBe(4000000);
  });
  test("bosluklari ve para birimini yok sayar", () => {
    expect(parseTRYInput(" 1.234,56 ₺ ")).toBe(123456);
  });
  test("tl son ekini yok sayar", () => {
    expect(parseTRYInput("200 TL")).toBe(20000);
  });
  test("bos metinde null doner", () => {
    expect(parseTRYInput("")).toBeNull();
  });
  test("sayi olmayan metinde null doner", () => {
    expect(parseTRYInput("abc")).toBeNull();
  });
  test("iki ondalik ayraci olan bozuk girdide null doner", () => {
    expect(parseTRYInput("1,2,3")).toBeNull();
  });
  test("ucten fazla kurus hanesi olan girdide null doner", () => {
    expect(parseTRYInput("12,3456")).toBeNull();
  });
  test("cok basamakli binlik gruplarini ayristirir", () => {
    expect(parseTRYInput("1.234.567")).toBe(123456700);
  });
  test("binlik gruplari + ondalik birlikte calisir", () => {
    expect(parseTRYInput("1.234.567,89")).toBe(123456789);
  });
  test("bozuk binlik gruplamasinda null doner", () => {
    expect(parseTRYInput("1.23.456")).toBeNull();
  });
  test("karisik ayrac turunde null doner", () => {
    expect(parseTRYInput("1.234,567.89")).toBeNull();
  });
});

describe("percentOf", () => {
  test("yuzdeyi hesaplar", () => {
    expect(percentOf(asKurus(2500), asKurus(10000))).toBe(25);
  });
  test("bolen sifirsa sifir doner -- bolme hatasi firlatmaz", () => {
    expect(percentOf(asKurus(2500), ZERO_KURUS)).toBe(0);
  });
  test("limiti asan harcamada 100'un ustunu doner", () => {
    expect(percentOf(asKurus(15000), asKurus(10000))).toBe(150);
  });
});
