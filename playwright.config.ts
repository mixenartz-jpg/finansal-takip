import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Korumalı sayfa testleri için kimlik bilgisi var mı?
 *
 * `.env.local` okunmuyor burada — Playwright `webServer` altındaki
 * Next'e env'i kendisi geçiriyor, ama config'in kendisi düz Node
 * ortamında değerlendiriliyor. Bu yüzden değişkenler kabuktan
 * (ya da CI secret'larından) gelmeli.
 */
const hasE2ECredentials = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Tek worker: testler ayni Supabase kullanicisinin verisini paylasiyor.
  // Paralel kosum, bir testin sildigi islemi digerinin okumasina yol acar.
  workers: 1,
  reporter: "list",
  use: { baseURL, trace: "on-first-retry", locale: "tr-TR", timezoneId: "Europe/Istanbul" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "anon",
      testMatch: /(giris|a11y)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    /*
     * Korumalı sayfalar — gerçek oturum gerektirir.
     *
     * `auth.setup.ts` kimlik bilgisi (E2E_EMAIL / E2E_PASSWORD)
     * yoksa kendini ATLAR ve `storageState` dosyası hiç oluşmaz.
     * O dosyayı koşulsuz istemek, atlanmış bir kurulumu 5 KIRMIZI
     * teste çeviriyordu — "kimlik bilgisi yok" ile "test bozuk"
     * aynı görünüyordu.
     *
     * Bu yüzden proje yalnızca kimlik bilgisi varken etkin.
     * Yokken hiç çalıştırılmıyor; `anon` projesi (erişilebilirlik)
     * normal koşuyor.
     */
    ...(hasE2ECredentials
      ? [
          {
            name: "app" as const,
            testIgnore: /(giris|a11y)\.spec\.ts/,
            dependencies: ["setup"],
            use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
          },
        ]
      : []),
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
