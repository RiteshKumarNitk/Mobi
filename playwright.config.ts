import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E tests for critical storefront journeys.
 *
 * Expects the API and storefront to be running already (dev or production build):
 *   E2E_WEB_URL  (default http://localhost:3000)
 *   E2E_API_URL  (default http://localhost:4000/api)
 * The API must run with OTP_DEBUG=true (non-production) — tests read the debug OTP
 * shown on screen and use COD only, so no SMS or payment is ever sent.
 * Run against a dev/test database only.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: false, hasTouch: true } },
  ],
});
