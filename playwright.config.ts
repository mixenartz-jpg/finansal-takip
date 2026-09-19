import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
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
    {
      name: "app",
      testIgnore: /(giris|a11y)\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
    },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
