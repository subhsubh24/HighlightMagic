# Validation completeness — the loop can't ship what it can't validate

This is the contract that lets the owner trust the autonomous loop with "validate the app, all flows,
all capabilities." Two layers:

## 1. Every PR — keyless, free, blocking
- **Flows** are validated by the journey suite (`web/e2e/`, the required `web-e2e` check): it builds
  + starts the app and drives the real user journeys, asserting the intended OUTCOME (not just HTTP
  200). Plus 600+ unit tests (`web`) and lint-at-zero (`web-lint`).
- **No-unregistered-service gate** (`web/src/lib/validation-manifest.test.ts`, runs in the required
  `web` check): every `process.env.*` the backend reads must be registered in
  `web/src/lib/validation-manifest.ts` with a validation mode. A brand-new, unregistered external
  service **fails the build → blocks the PR**. This is the mechanism that stops the loop from silently
  shipping a capability it hasn't accounted for. (It already caught `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.)

When the gate trips, the loop must register the service with the right mode **and** build its
validation path before the PR can merge:

| mode | meaning | how it's validated |
|------|---------|--------------------|
| `mock` | keyless: service fails-open or has an in-memory fallback in CI | a contract/unit test + the journey suite, every PR |
| `live-eval` | the real round-trip needs a paid key | the gated live-eval job (below), on a cadence — **not** every PR |
| `owner-only` | the loop physically can't validate it | owner / at launch (Apple receipts, social publishing, the site gate) |
| `build-config` | non-secret config (public URLs, flags) | nothing to validate |
| `test-only` | a flag only CI sets; prod must never set it | enforced separately (e.g. the rate-limit fail-to-boot guard) |
| `internal` | a secret the app holds for its own server-to-server auth | the route's own tests |

## 2. On a cadence — real paid round-trips (owner-funded)
`.github/workflows/live-eval.yml` runs **weekly + on demand** (never on PRs, never a required check —
it spends real tokens). It exercises the real services against the gold fixtures:
- **Anthropic** detection eval (`web/src/evals/detect.eval.ts`) — live today.
- **ElevenLabs** (TTS) and **AtlasCloud/Kling** (video) — activate as their evals land (ROADMAP G3).

Keys are **owner-funded GitHub Actions secrets** (`OWNER_ACTIONS: validation-eval-keys`): separate,
low-budget, hard-capped keys — distinct from the Vercel runtime keys. When a key is absent the matching
step **skips and prints a warning**, so the workflow never reddens the branch during setup; the
capability simply stays mock-validated and can't be ticked "done" until the live-eval has run green.

## What this guarantees the owner
- A new capability/service **cannot merge** unless it's registered with a validation path.
- Missing validation keys **surface** (OWNER_ACTION + a skipped-with-warning eval run), they don't
  silently pass as validated.
- Flows are always validated for free on every PR; real paid round-trips are validated on a bounded,
  owner-funded cadence. The loop only spends on validation when the owner has funded it.

## What it does NOT cover (honest limits)
- **iOS** runtime/device validation: the Linux loop can only compile + unit-test iOS via the `ios`
  check; native UI journeys (XCUITest) + an archivable build are tracked in ROADMAP A6/G4.
- **Real user/PMF signal**: only exists post-launch.
