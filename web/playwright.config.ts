import { defineConfig, devices } from "@playwright/test";

// BUILDS != WORKS — real-browser, outcome-asserting journey suite.
// Runnable LOCALLY and on CI. By default Playwright launches its OWN managed
// Chromium (no hardcoded executablePath) so the suite never "builds but won't run"
// off-CI. Optional escape hatch: set PLAYWRIGHT_CHROMIUM_PATH to a system browser.
//
// Targets a local production build by default; set BASE_URL=<deployed-url> to RUN the
// same journeys against the deployed app (used to pin an env/migration-drift bug to prod).
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3100";
const usingExternalTarget = Boolean(process.env.BASE_URL);
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Captcha (Turnstile) fails OPEN when TURNSTILE_SECRET_KEY is unset, so the real
    // signup/waitlist flow works headlessly without any third-party key.
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
      },
    },
    {
      // Phone form factor — HighlightMagic is a vertical-video app whose users live on
      // their phones, so the journey suite must prove the flows work (and look right) at
      // a real mobile viewport, not just Desktop Chrome. Pixel 5 is Chromium-based
      // (393×727, touch, mobile UA), so it reuses the SAME managed/system Chromium as the
      // desktop project — no extra browser download needed. Screenshots land in a
      // per-project subdir (see journeys.spec.ts) so the two form factors never collide.
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
        launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
      },
    },
  ],
  // Only boot a local server when we are NOT pointed at an external/deployed target.
  webServer: usingExternalTarget
    ? undefined
    : {
        // Seeded throwaway env: a production build + start with the minimum env to boot.
        // No DB/migrations in this product's web/ (only optional Vercel KV), so there is
        // no migration chain to apply; TURNSTILE_SECRET_KEY stays unset => captcha open.
        command: "npm run build && npm run start -- -p 3100",
        url: BASE_URL,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
      },
});
