# Highlight Magic

[![CI](https://github.com/subhsubh24/HighlightMagic/actions/workflows/ci.yml/badge.svg)](https://github.com/subhsubh24/HighlightMagic/actions/workflows/ci.yml)

A freemium iOS app that turns raw personal videos into share-ready short vertical highlights —
import footage, AI finds the best moments, edit, and export a 1080×1920 clip for TikTok / Reels /
Shorts. **Status: pre-launch** (join the waitlist on the marketing site; the app ships via the
App Store / TestFlight).

## How it works

`import / capture → detect highlights → edit (trim, captions, filters) → 1080×1920 export → share`

## Two components

| Component | Stack | Role |
|---|---|---|
| **iOS app** (repo root) | Swift 6 · iOS 18 · SwiftUI/MVVM · AVFoundation · StoreKit 2 | The product the user installs |
| **`web/`** | Next.js (App Router) on Vercel | The API-cost-bearing **backend** (all paid AI calls) **+** the marketing/waitlist site |

## AI is server-side (business-paid model)

Paid AI runs **on the backend**, not on the device, and the business holds the keys — the iOS app
routes calls through `web/` and ships with **no embedded API keys**:

- **Highlight detection** — server-side Claude Haiku frame scoring via `/api/score` (with a
  lightweight on-device Vision classification fallback for offline/degraded scenarios; the
  optional CoreML model is not bundled in the shipped build).
- **Planning / effects** — Claude Sonnet planner.
- **Audio (backend integration, not enabled in v1)** — ElevenLabs (music / SFX / voiceover /
  voice clone). The routes exist server-side but are dormant in the shipped v1 app; v1 audio is the
  user's original clip audio.
- **Photo→video / intro-outro (backend integration, not enabled in v1)** — AtlasCloud (Kling).

The free quota and Pro entitlement are enforced **server-side, before any paid call** (StoreKit 2
signed-transaction / App Store Server API verification — never trusting a client flag), behind rate
limiting and a code-level spend ceiling. Model choices are cost-optimized and periodically
re-benchmarked (cheapest model that still clears each task's quality bar).

## Pricing

- **Free** — 5 exports / month, with a watermark.
- **Pro** — **$14.99/mo** or **$149.99/yr** — removes the watermark and the export limit.

## Requirements

- **iOS:** iOS 18.0+, Xcode 16+, Swift 6 (builds as a SwiftPM package; an archivable app target for
  store submission is tracked but not yet built).
- **web/:** Node 20+. Backend env (server-side only): `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`,
  `ATLASCLOUD_API_KEY` (see `PENDING_OPS.md`).

## Project structure

```
Sources/                 iOS app (SwiftPM target "HighlightMagic")
  App/ Models/ Views/ Services/ Utilities/ Resources/
Tests/HighlightMagicTests/   iOS unit/integration tests
web/                     Next.js backend + marketing site
  src/app/               routes: / (editor), /landing, /privacy, /terms, /support, /offline
  src/app/api/           backend (paid-AI proxy, waitlist, entitlement, …)
  src/lib/               entitlement, ai-models, rate-limit, analytics, …
  e2e/                   Playwright outcome-asserting journey suite (+ screenshots)
docs/                    BUSINESS_CASE, MODEL_COSTS, growth/, quality/, qa/
ROADMAP.md · VISION.md · FACTORY_STANDARD.md · PENDING_OPS.md · REMAINING_STEPS.md
```

## Build & test

```bash
# web (the required `web` CI gate)
cd web && npm ci && npm run build && npm test      # build + Vitest unit tests
npm run test:e2e                                   # Playwright functional journey suite (real browser)

# iOS — verified by the required `ios` CI check (xcodebuild build + test on macOS)
swift build && swift test                          # package-level build/tests
```

Both `web` and `ios` are **required** CI checks on `main` (auto-merge + squash). `scripts/preflight.sh`
is the mechanical readiness gate.

## Pre-launch site gate

When `SITE_GATE_PASSWORD` is set, the deployed web app is password-protected, but the marketing
surfaces (`/landing`, legal pages) and the waitlist API stay public so people can still sign up.
Unset it at launch to open the app.

## How this repo is built

HighlightMagic is developed by an autonomous build loop that follows `FACTORY_STANDARD.md` (shared
operating discipline) + `ROADMAP.md` (what to build, the Definition of Done). Quality is enforced by
CI, two independent reviewers per change, an outcome-asserting functional suite ("builds ≠ works"),
an independent quality grade, and a two-gate readiness check — never self-certified. Owner-only steps
(signing, live keys, App Store submission, provider spend caps) are tracked in `PENDING_OPS.md` /
`REMAINING_STEPS.md`.
