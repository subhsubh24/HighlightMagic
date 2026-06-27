import { test, expect, type Page } from "@playwright/test";

// BUILDS != WORKS: every test RUNS the real flow as a user and asserts the INTENDED
// OUTCOME (a working, populated screen) — never just status<400 or "a handler exists".
// The app's error boundary (src/app/error.tsx) renders this exact copy on a crash;
// every journey asserts it is ABSENT.
const ERROR_BOUNDARY = "Something went wrong";

async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
}

test.describe("HighlightMagic web — critical journeys (outcome-asserting)", () => {
  test("app main screen (/) renders the real editor, not an error", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status(), "/ must not be a 4xx/5xx").toBeLessThan(400);
    // Intended outcome: the real editor's initial (Upload) screen — the "Drop your
    // footage." hero where a user starts — NOT the error boundary or a blank page.
    await expect(page.getByRole("heading", { name: /Drop your footage/i })).toBeVisible();
    await expectNoErrorBoundary(page);
  });

  test("landing (/landing) renders the real marketing page with a working waitlist form", async ({ page }) => {
    const res = await page.goto("/landing");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("h1").first()).toBeVisible(); // real hero, not a blank/boundary
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expectNoErrorBoundary(page);
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
    await expectNoErrorBoundary(page);
  });

  // Every primary nav target resolves to its REAL screen (heading present, no boundary, not 404).
  for (const route of ["/privacy", "/terms", "/support", "/offline"]) {
    test(`nav target ${route} resolves to a real screen`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status(), `${route} must not be 4xx/5xx`).toBeLessThan(400);
      await expect(page.locator("h1, h2").first()).toBeVisible();
      await expectNoErrorBoundary(page);
    });
  }
});
