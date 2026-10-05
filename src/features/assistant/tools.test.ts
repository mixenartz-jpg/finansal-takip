import { describe, expect, test } from "vitest";
import { TOOLS, TOOL_NAMES, WRITE_TOOLS, isToolName } from "./tools";

/**
 * Araç tanımlarının ŞEMA SÖZLEŞMESİ.
 *
 * Bu testler "Gemini ne yapıyor" değil, "biz ona ne gönderiyoruz"
 * sorusunu doğrular. Bozuk bir tanım (eksik `type`, boş `description`)
 * Gemini tarafından SESSİZCE yok sayılır: model aracı hiç çağırmaz,
 * kullanıcı "asistan beni anlamadı" der ve sebebi hiçbir yerde
 * görünmez. Bu yüzden biçim burada kilitleniyor.
 */

describe("TOOLS -- Interactions API biçimi", () => {
  test("her araç type:'function' taşır", () => {
    for (const t of TOOLS) {
      expect(t.type, `${t.name} type alanı yanlış`).toBe("function");
    }
  });

  test("her aracın adı ve açıklaması var", () => {
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*$/);
      // Boş açıklama = model aracın ne işe yaradığını bilmiyor.
      expect(t.description.length, `${t.name} açıklaması çok kısa`).toBeGreaterThan(15);
    }
  });

  test("her aracın parametre şeması nesne tipinde", () => {
    for (const t of TOOLS) {
      expect(t.parameters.type, `${t.name} parameters.type`).toBe("object");
      expect(t.parameters.properties, `${t.name} properties yok`).toBeTruthy();
    }
  });

  /**
   * `required` içindeki her ad `properties` içinde TANIMLI olmalı.
   * Olmayan bir alanı zorunlu ilan etmek, modelin her çağrıda
   * uyduracağı bir alan demektir.
   */
  test("required alanları properties içinde tanımlı", () => {
    for (const t of TOOLS) {
      for (const req of t.parameters.required ?? []) {
        expect(
          Object.keys(t.parameters.properties),
          `${t.name}: "${req}" zorunlu ama tanımsız`,
        ).toContain(req);
      }
    }
  });

  test("araç adları tekrarsız", () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });

  test("isToolName tanımsız adı reddeder", () => {
    expect(isToolName("getBalances")).toBe(true);
    expect(isToolName("dropDatabase")).toBe(false);
    expect(isToolName("")).toBe(false);
    expect(isToolName(null)).toBe(false);
  });

  /**
   * Yazma araçları AYRI listelenmeli: Faz 4'te onay kartı yalnızca
   * bu listeye bakarak "bu niyet onay ister mi" kararını verecek.
   * Okuma aracı yanlışlıkla bu listeye girerse kullanıcı bakiyesini
   * sormak için bile onay vermek zorunda kalır.
   */
  test("WRITE_TOOLS yalnızca yazma araçlarını içerir", () => {
    for (const name of WRITE_TOOLS) {
      expect(TOOL_NAMES, `${name} TOOLS içinde yok`).toContain(name);
      expect(name).toMatch(/^(create|update|delete|archive|set|add)/);
    }
    // Okuma araçları listede OLMAMALI.
    for (const read of ["getBalances", "getSpending", "findTransactions"]) {
      expect(WRITE_TOOLS as readonly string[]).not.toContain(read);
    }
  });

  test("spec'teki okuma araçlarının hepsi var", () => {
    for (const name of [
      "getBalances",
      "getSpending",
      "getBudgetStatus",
      "getDebts",
      "findTransactions",
    ]) {
      expect(TOOL_NAMES).toContain(name);
    }
  });

  test("spec'teki yazma araçlarının hepsi var", () => {
    for (const name of [
      "createTransaction",
      "updateTransaction",
      "deleteTransaction",
      "createAccount",
      "updateAccount",
      "archiveAccount",
      "createCategory",
      "updateCategory",
      "setBudget",
      "deleteBudget",
      "createRecurringRule",
      "updateRecurringRule",
      "deleteRecurringRule",
      "createDebt",
      "updateDebt",
      "addDebtPayment",
    ]) {
      expect(TOOL_NAMES).toContain(name);
    }
  });
});
