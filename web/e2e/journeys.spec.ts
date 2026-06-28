import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

// Anchor screenshots to THIS spec's directory (web/e2e), not the process CWD, so the
// committed PNGs always land in web/e2e/__screenshots__ regardless of where Playwright is
// invoked from. (A bare relative path resolves against the CWD; running from the repo root
// would silently write them elsewhere while still reporting green — making the committed
// captures go stale undetected.)
const SHOT_DIR = path.join(__dirname, "__screenshots__");

// BUILDS != WORKS: every test RUNS the real flow as a user and asserts the INTENDED
// OUTCOME (a working, populated screen) — never just status<400 or "a handler exists".
// The app's error boundary (src/app/error.tsx) renders this exact copy on a crash;
// every journey asserts it is ABSENT.
const ERROR_BOUNDARY = "Something went wrong";

async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
}

// Route-to-screenshot filename map for the parameterized nav loop.
const NAV_SCREENSHOTS: Record<string, string> = {
  "/privacy": "04-privacy.png",
  "/terms": "05-terms.png",
  "/support": "06-support.png",
  "/offline": "07-offline.png",
};

test.describe("HighlightMagic web — critical journeys (outcome-asserting)", () => {
  test("app main screen (/) renders the real editor, not an error", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status(), "/ must not be a 4xx/5xx").toBeLessThan(400);
    // Intended outcome: the real editor's initial (Upload) screen — the "Drop your
    // footage." hero where a user starts — NOT the error boundary or a blank page.
    await expect(page.getByRole("heading", { name: /Drop your footage/i })).toBeVisible();
    await expectNoErrorBoundary(page);
    // FACTORY_STANDARD §6 — capture the asserted state so a vision-capable gate can
    // visually review the real rendered UI (a green DOM assertion alone hides a blank surface).
    await page.screenshot({ path: path.join(SHOT_DIR, "01-app-main-drop-footage.png"), fullPage: true });
  });

  test("landing (/landing) renders the real marketing page with a working waitlist form", async ({ page }) => {
    const res = await page.goto("/landing");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("h1").first()).toBeVisible(); // real hero, not a blank/boundary
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expectNoErrorBoundary(page);
    // FACTORY_STANDARD §6 — screenshot after assertions pass.
    await page.screenshot({ path: path.join(SHOT_DIR, "02-landing-hero.png"), fullPage: true });
  });

  test('waitlist signup (the real "signup" flow) reaches the success outcome', async ({ page }) => {
    await page.goto("/landing");
    // Self-seed via the REAL flow: submit a unique email through the actual form.
    const email = `e2e+${Date.now()}@example.com`;
    const input = page.locator('input[type="email"]').first();
    await input.fill(email);
    await input.press("Enter");
    // Intended OUTCOME (not a 200): the success state actually renders.
    await expect(page.getByText("You're on the list!")).toBeVisible();
    // DECISION COROLLARY — no gate on an unbuilt loop: in this dry-run env (no email provider) the
    // signup must NOT dead-end on a "check your email to confirm" step that can never complete.
    await expect(page.getByText(/check your email/i)).toHaveCount(0);
    await expectNoErrorBoundary(page);
    // FACTORY_STANDARD §6 — screenshot after assertions pass.
    await page.screenshot({ path: path.join(SHOT_DIR, "03-landing-waitlist-success.png"), fullPage: true });
  });

  // Every primary nav target resolves to its REAL screen (heading present, no boundary, not 404).
  for (const route of ["/privacy", "/terms", "/support", "/offline"]) {
    test(`nav target ${route} resolves to a real screen`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status(), `${route} must not be 4xx/5xx`).toBeLessThan(400);
      await expect(page.locator("h1, h2").first()).toBeVisible();
      await expectNoErrorBoundary(page);
      // FACTORY_STANDARD §6 — screenshot after assertions pass, keyed by route.
      await page.screenshot({ path: path.join(SHOT_DIR, NAV_SCREENSHOTS[route]), fullPage: true });
    });
  }
});
