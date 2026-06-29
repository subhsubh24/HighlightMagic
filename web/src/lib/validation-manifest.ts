/**
 * VALIDATION MANIFEST — the single source of truth for every external service / secret the
 * backend touches, and HOW each is validated. This exists so the loop can never silently ship a
 * capability it cannot validate: `validation-manifest.test.ts` (which runs in the REQUIRED `web`
 * check) asserts that EVERY `process.env.*` the code reads is registered here. A brand-new,
 * unregistered env var FAILS the build → BLOCKS the PR until it's registered with a validation mode.
 *
 * Validation modes:
 *   - "mock"        — the capability is validated WITHOUT the real key: a deterministic
 *                     contract/unit test and/or the keyless journey suite covers the flow (the
 *                     service fails-open or has an in-memory fallback in CI). Free, runs every PR.
 *   - "live-eval"   — the REAL round-trip needs a paid key; validated by the gated live-eval job
 *                     (.github/workflows/live-eval.yml) on a cadence + before readiness, NOT every
 *                     PR. The key is an owner-funded GitHub Actions secret (see OWNER_ACTIONS:
 *                     validation-eval-keys). Missing key → the job SKIPS + surfaces, it never reddens
 *                     normal PRs; the capability cannot be ticked "done" until it has run green.
 *   - "owner-only"  — cannot be validated by the loop at all (live signing, App Store receipt root
 *                     CA, owner-connected social-publishing channels, the pre-launch site gate).
 *                     Validated by the owner / at launch; recorded in REMAINING_STEPS.md.
 *   - "build-config"— non-secret build/runtime configuration (public URLs, flags). No key to validate.
 *   - "test-only"   — a flag that ONLY CI/tests set; production must never set it (enforced elsewhere).
 *   - "internal"    — a secret the deployed app generates/holds for its own server-to-server auth;
 *                     no external third party, validated by the route's own tests.
 *
 * DISCIPLINE (factory loop): if you add code that reads a NEW external service/secret, you MUST add
 * an entry here with the correct mode AND ensure its validation path exists (a keyless contract test
 * for "mock"; an eval + an OWNER_ACTION for the key for "live-eval"). The test below enforces this.
 */

export type ValidationMode =
  | "mock"
  | "live-eval"
  | "owner-only"
  | "build-config"
  | "test-only"
  | "internal";

export interface ServiceEntry {
  /** The exact env var name as read via process.env. */
  env: string;
  /** Human-readable service / what it is. */
  service: string;
  /** What the app uses it for. */
  purpose: string;
  /** How this capability is validated — see the modes above. */
  validation: ValidationMode;
  /** For "live-eval": which eval exercises the real round-trip + funding note. */
  evalNote?: string;
}

export const VALIDATION_MANIFEST: ServiceEntry[] = [
  // ── PAID AI services — real round-trips validated by the gated live-eval job (owner-funded keys) ──
  {
    env: "ANTHROPIC_API_KEY",
    service: "Anthropic",
    purpose: "Frame scoring + edit-plan generation (the detection core).",
    validation: "live-eval",
    evalNote: "web/src/evals/detect.eval.ts (EVAL_MODE=1) — real Anthropic round-trip vs gold fixtures. Key: owner-funded GH Actions secret.",
  },
  {
    env: "ELEVENLABS_API_KEY",
    service: "ElevenLabs",
    purpose: "Voiceover / text-to-speech generation.",
    validation: "live-eval",
    evalNote: "TTS quality eval — to be built (ROADMAP G3). Until the eval exists the flow is mock-validated; key: owner-funded GH Actions secret.",
  },
  {
    env: "ATLASCLOUD_API_KEY",
    service: "AtlasCloud / Kling",
    purpose: "AI video generation (most expensive per call).",
    validation: "live-eval",
    evalNote: "Video-gen quality eval — to be built (ROADMAP G3). Until the eval exists the flow is mock-validated; key: owner-funded GH Actions secret.",
  },

  // ── Other external services — flow validated keyless (fail-open / in-memory fallback in CI) ──
  {
    env: "RESEND_API_KEY",
    service: "Resend (email)",
    purpose: "Waitlist double-opt-in confirmation email.",
    validation: "mock",
    evalNote: "Keyless: the waitlist journey runs the addConfirmedSignup fallback when email isn't configured; a real sandbox round-trip is owner-only (can be promoted to live-eval later).",
  },
  {
    env: "EMAIL_FROM",
    service: "Resend (email)",
    purpose: "From-address for confirmation email.",
    validation: "build-config",
  },
  {
    env: "TURNSTILE_SECRET_KEY",
    service: "Cloudflare Turnstile",
    purpose: "CAPTCHA on the public waitlist form.",
    validation: "mock",
    evalNote: "Keyless: CAPTCHA fails open when unset, so the journey suite validates the form without a key.",
  },
  {
    env: "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    service: "Cloudflare Turnstile",
    purpose: "Public CAPTCHA widget site key (non-secret; rendered client-side on the landing form).",
    validation: "build-config",
  },
  {
    env: "KV_REST_API_URL",
    service: "Vercel KV",
    purpose: "Authoritative server-side quota store (Upstash Redis).",
    validation: "mock",
    evalNote: "Keyless: kv-quota-store falls back to in-memory when unset; unit tests cover the quota logic.",
  },
  {
    env: "KV_REST_API_TOKEN",
    service: "Vercel KV",
    purpose: "Auth token for the KV quota store.",
    validation: "mock",
    evalNote: "Keyless: in-memory fallback when unset (see KV_REST_API_URL).",
  },

  // ── Owner-only — cannot be validated by the Linux loop; validated by the owner / at launch ──
  {
    env: "APP_STORE_ROOT_CA_PEM",
    service: "Apple StoreKit",
    purpose: "Root CA used to verify App Store signed JWS receipts.",
    validation: "owner-only",
  },
  {
    env: "APP_STORE_BUNDLE_ID",
    service: "Apple StoreKit",
    purpose: "Expected bundle id when validating receipts.",
    validation: "owner-only",
  },
  {
    env: "SITE_GATE_PASSWORD",
    service: "Pre-launch site gate",
    purpose: "Password-protects the unfinished web app pre-launch (owner sets, unsets at launch).",
    validation: "owner-only",
  },
  {
    env: "INSTAGRAM_ACCESS_TOKEN",
    service: "Instagram (owner-connected publishing)",
    purpose: "Growth publishing via the owner's authorized channel.",
    validation: "owner-only",
  },
  {
    env: "REDDIT_ACCESS_TOKEN",
    service: "Reddit (owner-connected publishing)",
    purpose: "Growth publishing via the owner's authorized channel.",
    validation: "owner-only",
  },
  {
    env: "TIKTOK_ACCESS_TOKEN",
    service: "TikTok (owner-connected publishing)",
    purpose: "Growth publishing via the owner's authorized channel.",
    validation: "owner-only",
  },
  {
    env: "X_API_BEARER_TOKEN",
    service: "X/Twitter (owner-connected publishing)",
    purpose: "Growth publishing via the owner's authorized channel.",
    validation: "owner-only",
  },

  // ── Internal server-to-server auth ──
  {
    env: "GROWTH_AGENT_SECRET",
    service: "Internal",
    purpose: "Shared secret authenticating the Growth Agent to the deployed app's growth endpoints.",
    validation: "internal",
  },

  // ── Non-secret build/runtime configuration ──
  { env: "NEXT_PUBLIC_APP_URL", service: "Config", purpose: "Public base URL of the app.", validation: "build-config" },
  { env: "NEXT_PUBLIC_IOS_APP_STORE_URL", service: "Config", purpose: "App Store link surfaced in the UI.", validation: "build-config" },
  { env: "NEXT_PUBLIC_DEBUG", service: "Config", purpose: "Client-side debug flag.", validation: "build-config" },
  { env: "NODE_ENV", service: "Framework", purpose: "Node/Next environment (set by the framework).", validation: "build-config" },
  { env: "RENDER_ENABLED", service: "Config", purpose: "Feature flag for server-side render path.", validation: "build-config" },
  { env: "DEBUG_DETECT", service: "Config", purpose: "Verbose detection logging flag.", validation: "build-config" },

  // ── Test-only flags — production must NEVER set these ──
  {
    env: "EVAL_MODE",
    service: "Test harness",
    purpose: "Gates the paid evals so the normal suite never spends.",
    validation: "test-only",
  },
  {
    env: "E2E_RATELIMIT_BYPASS",
    service: "Test harness",
    purpose: "Disables per-IP rate limiting for the CI journey suite; the app fails to boot if set on Vercel.",
    validation: "test-only",
  },
];

/** Fast lookup set of every registered env var. */
export const REGISTERED_ENV_VARS: ReadonlySet<string> = new Set(
  VALIDATION_MANIFEST.map((e) => e.env),
);
