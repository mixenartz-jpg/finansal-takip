import { test as setup, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Oturum kurulumu — korumalı sayfaların E2E testleri için.
 *
 * ── NEDEN BU DOSYA UZUN SÜRE YOKTU ──
 *
 * `playwright.config.ts` bu dosyayı bir `setup` projesi olarak
 * tanımlıyordu ama dosya HİÇ var olmadı. Sonuç: `app` projesindeki
 * her test sessizce çalıştırılamıyordu. `npx playwright test`
 * çağrısı "no tests found" değil, dependency hatası veriyordu ve
 * kimse korumalı sayfaları uçtan uca doğrulamıyordu.
 *
 * ── NEDEN GERÇEK GİRİŞ, MOCK DEĞİL ──
 *
 * Supabase oturumu HttpOnly cookie'lerde yaşıyor ve middleware
 * bunları doğruluyor. Elle uydurulmuş bir cookie reddedilir;
 * gerçek giriş yapıp `storageState` kaydetmek tek güvenilir yol.
 *
 * ── KİMLİK BİLGİSİ NEREDEN ──
 *
 * `.env.local` içine şu iki satır eklenir:
 *
 *   E2E_EMAIL=test@ornek.com
 *   E2E_PASSWORD=...
 *
 * Bu hesap Supabase'de GERÇEKTEN var olmalı (bir kez elle kaydol).
 * Testler bu hesabın verisini paylaşıyor; kişisel hesabını
 * KULLANMA — testler işlem ekleyip silebilir.
 *
 * Değişkenler yoksa kurulum ATLANIR: asistan/dikte testleri de
 * atlanır, ama `anon` projesi (erişilebilirlik, giriş sayfası)
 * normal koşmaya devam eder. Böylece kimlik bilgisi olmayan bir
 * geliştiricide takım tamamen kırmızı yanmıyor.
 */

const STORAGE = "e2e/.auth/user.json";

setup("oturum aç ve durumu kaydet", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  setup.skip(
    !email || !password,
    "E2E_EMAIL / E2E_PASSWORD tanımlı değil — korumalı sayfa testleri atlanıyor.",
  );

  await page.goto("/giris");

  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.getByRole("button", { name: "Giriş yap" }).click();

  // Giriş başarılıysa middleware panele yönlendirir. Yönlendirmeyi
  // beklemek şart: cookie'ler yazılmadan storageState kaydedilirse
  // dosya boş çıkar ve `app` projesi oturumsuz koşar.
  await page.waitForURL((url) => !url.pathname.startsWith("/giris"), { timeout: 15_000 });

  // Gezinme göründü mü — gerçekten içeride miyiz?
  await expect(page.getByRole("navigation", { name: "Ana gezinme" }).first()).toBeVisible();

  if (!existsSync(dirname(STORAGE))) mkdirSync(dirname(STORAGE), { recursive: true });
  await page.context().storageState({ path: STORAGE });
});
