# Pending Operations — Human-Required Steps

Items the factory cannot perform (signing, live keys, store setup, publishing).
The owner must apply these before shipping to the App Store.

## Backend API Keys (Vercel Environment Variables)

Set these in the Vercel dashboard for the `web/` deployment:

| Variable | Purpose | Required for |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude frame scoring + tape planning + validation | All AI detection/generation |
| `ELEVENLABS_API_KEY` | Music, SFX, voiceover, voice clone generation | Audio features |
| `ATLASCLOUD_API_KEY` | Photo animation (Kling), video generation (Wan), upscale | Photo animation + intro/outro |

## Server-Side Quota (B3 — BLOCKED: requires auth layer first)

Free tier enforcement (5 exports/user/month) is currently CLIENT-SIDE ONLY in the iOS app
(`AppState.exportsUsedThisMonth` in UserDefaults). This can be bypassed by reinstalling the
app or modifying client state.

To enforce server-side, two infrastructure prerequisites must be added first:

### Prerequisite 1 — Auth layer (owner decision required)

Without a server-verified identity, any HTTP client can pass `{ "isProUser": true }` in the
request body to bypass the quota limit entirely. The `userId` must come from a verified
session token, not the caller-supplied request body.

Add an auth provider before implementing quota routes:
- **Clerk** (recommended for Next.js): `npm install @clerk/nextjs`; wrap route handlers with `auth()`
- **Supabase Auth**: provides JWT + optional row-level security

Once auth is added, the `quota.ts` library and tests from the closed PR #29 branch
(`claude/b3-quota-api`) can be restored and the route handlers updated to derive `userId`
from the verified session.

### Prerequisite 2 — Vercel KV
1. Add **Vercel KV** (Redis) to the Vercel project (Storage tab in Vercel dashboard)
2. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars (Vercel provides these automatically)

### Implementation steps (after both prerequisites are met)
3. Restore `/api/quota/check` and `/api/quota/increment` from PR #29 branch, updated to
   derive `userId` from the auth session (e.g. `auth().userId`) instead of the request body
   Key pattern: `quota:{userId}:{YYYY-MM}`, TTL: 31 days
4. Call `quota/check` at the start of the detection pipeline; call `quota/increment` on
   successful export; return HTTP 402 if limit is exceeded for free users

## P0 — iOS API Keys (BYOK model confirmed)

The app is confirmed BYOK (bring-your-own-key). Users configure their own Anthropic API key
in Settings > AI Settings. The implementation is already functionally correct.

Remaining owner action: add a clear onboarding screen explaining BYOK and where to get an
API key (console.anthropic.com). The factory will add a Settings UI entry point in a future
run; the onboarding copy needs owner review before it ships.

## iOS App Signing & Provisioning

1. Apple Developer account with an active membership
2. App ID: `com.highlightmagic.app` registered in the portal
3. Distribution certificate + provisioning profile in Xcode
4. `DEVELOPMENT_TEAM` in project.pbxproj updated from `REPLACE_WITH_YOUR_TEAM_ID`

## StoreKit Live Products

Create in App Store Connect → Subscriptions:
- Product ID: `pro.monthly` (matches `SubscriptionProduct.monthly.rawValue`)
- Product ID: `pro.yearly` (matches `SubscriptionProduct.yearly.rawValue`)

Enable StoreKit configuration in Xcode for development testing.

## iOS CI (A1)

A1 is substantially done — SwiftPM test target added in #15 and the xcodeproj was removed.
The `ios` CI job is NON-BLOCKING. PR #16 (`claude/a1-ci-destination`) attempted a destination
fix but is broken (edits .github/ BLAST RADIUS + Swift syntax bug) — **close this PR without
merging**. If the `ios` CI job fails on future PRs, diagnose the runner failure separately.

## App Store Assets

- App icon: present (`Sources/Resources/`) — verify correct sizes for all slots
- Screenshots: 6.7" and 6.1" iPhone screenshots needed (min 3 each)
- App preview video: optional but recommended for a video editing app
- Support URL: set to `https://highlightmagic.app/support` (or similar)
- Privacy policy URL: set to `https://highlightmagic.app/privacy` (page exists in web/)

## App Privacy Labels (App Store Connect)

Set App Privacy labels to match the privacy policy:
- **Data Not Collected** — no names, emails, addresses, contacts
- **Data Not Linked to You** — anonymous ID used only for export count (not linked to identity)
- **Data Used to Track You** — none (no advertising)
- Third-party SDK disclosure: Anthropic, ElevenLabs, AtlasCloud (server-side only — may not
  require label if processing is server-side; verify with Apple's guidelines)

## Privacy Contact

Set up `privacy@highlightmagic.app` email to respond to privacy requests.

## PrivacyInfo.xcprivacy

`Sources/Resources/PrivacyInfo.xcprivacy` EXISTS and contains:
- `NSPrivacyAccessedAPICategoryUserDefaults` (CA92.1)
- `NSPrivacyAccessedAPICategoryFileTimestamp` (C617.1)

No action needed on PrivacyInfo.xcprivacy. Verify App Privacy labels in App Store Connect
match what the privacy policy discloses.

## Marketing / Web

- Connect and fund social / ad accounts before publishing the landing page / waitlist
- The `web/` landing page is staged; do not publish paid traffic until Pro subscription
  is live in App Store Connect
