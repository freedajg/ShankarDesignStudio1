import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build with a fresh embedded
 * database, local storage and the development payment provider.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const DATA = ".data/e2e";
const env = {
  PGLITE_DATA_DIR: `${DATA}/pglite`,
  LOCAL_STORAGE_DIR: `${DATA}/storage`,
  PAYMENT_PROVIDER: "dev",
  ALLOW_DEV_PAYMENTS: "true",
  APP_URL: `http://localhost:${PORT}`,
  // AI: the local test provider (draws deterministic artwork, no network/API cost)
  AI_IMAGE_PROVIDER: "fixture",
  AI_ALLOW_FIXTURE: "true",
  AI_FIXTURE_DELAY_MS: "1200",
  AI_MAX_GENERATIONS_PER_SESSION: "10",
};
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (process.env.PLAYWRIGHT_BROWSERS_PATH ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1, // one embedded database process
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: `rm -rf ${DATA} && npm run db:seed --silent && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 420_000,
    reuseExistingServer: false,
    env,
    stdout: "ignore",
    stderr: "pipe",
  },
});
