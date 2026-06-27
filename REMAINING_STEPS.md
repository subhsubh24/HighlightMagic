# Remaining Steps — Owner-Only Actions (in order)

This file lists, in the exact order the owner should execute them, the actions the autonomous
loop physically cannot take. Everything the loop *can* build has been built or is tracked in ROADMAP.md.

Keep this current: as the loop completes prerequisites, steps here become unblocked and should
be executed. Last updated: 2026-06-27 (Run 19).

---

## Phase 0 — Loop-deferred items (factory work not yet complete)

These items the autonomous loop CAN do but has not yet finished. They're listed here so the
owner knows the current state and can optionally unblock them faster.

### 0a. iOS service-layer API key removal

**COMPLETE** (Run 19): All 4 iOS services have been rewritten. No Anthropic API key remains
embedded in the iOS binary or Keychain. (Verified Run 19: `grep x-api-key Sources/Services/*.swift` = 0.)

- ~~`CloudScoringService.swift`~~ — **DONE** (PR #80, Run 14): routes through `/api/ios-score`.
- ~~`ClaudeVisionService.swift`~~ — **DONE** (PR #83, Run 15): `isAvailable` returns `false`; `scoreHighlights` disabled (superseded by `CloudScoringService`).
- ~~`TapeValidationService.swift`~~ — **DONE** (PR #105, Run 19): routes through `/api/ios-validate`.
  ⚠️ CORRECTION: prior runs recorded this as done in PR #84 (Run 15), but **#84 never merged**
  (closed) and its rescue **#100 was stuck** (stale base + a Swift `URL(string:)`/`URL` type
  error that failed the `ios` check). The embedded key remained on `main` until **#105** (Run 19),
  which fixed the type error and merged. This is why the DONE GUARD requires verifying the artifact
  on `main` — not trusting a PR reference.
- ~~`AIEffectRecommendationService.swift`~~ — **DONE** (PR #85, Run 15): routes through `/api/ios-plan`.

Supporting backend endpoints: `/api/ios-score` (#79), `/api/ios-validate` (#105), `/api/ios-plan` (#85). All gated by `checkExportAllowed`; all paid/expensive routes now rate-limited (#101/#105/#106).

**What the owner can do to unblock**: nothing — complete.

### 0b. Vercel KV provisioning for durable quota store

**CODE COMPLETE** (PR #66, Run 12): `web/src/lib/kv-quota-store.ts` — `VercelKVQuotaStore` using
`@vercel/kv` is shipped. `getQuotaStore()` automatically uses it when `KV_REST_API_URL` +
`KV_REST_API_TOKEN` are present; falls back to `InMemoryQuotaStore` otherwise.

**What the owner must do**:
1. In Vercel dashboard → Storage, create a **KV (Upstash Redis)** store and link it to the project.
2. This sets `KV_REST_API_URL` + `KV_REST_API_TOKEN` in Vercel env automatically.
3. No code change needed — the KV store activates immediately once the env vars are set.

### 0c. App Store Server API for Pro verification

`verifyProEntitlement()` in `web/src/lib/entitlement.ts` currently returns `false` (secure
default) until the App Store shared secret is configured.

1. In App Store Connect → your app → In-App Purchases → App-Specific Shared Secret, generate a
   shared secret.
2. Add `APP_STORE_SHARED_SECRET=<secret>` to Vercel env.
3. The factory can wire the receipt verification call once the secret is in place.

---

## Phase 1 — Backend (unblock before submission)

### 1. Set live API keys in Vercel

In the Vercel dashboard for the `web/` deployment, add these environment variables:

| Variable | Where to get it | Used for |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com | AI tape planning + validation (web backend) |
| `ELEVENLABS_API_KEY` | elevenlabs.io | Music, SFX, TTS, voice clone |
| `ATLASCLOUD_API_KEY` | atlascloud.ai | Photo animation (Kling), video gen |

Also set:
- `NEXT_PUBLIC_APP_URL=https://highlightmagic.app` (or your Vercel domain)
- `NEXT_PUBLIC_IOS_APP_STORE_URL=https://apps.apple.com/app/highlight-magic/idXXXXXXXXX`
  (update after App Store Connect record is created — see Step 3)

**Set an Anthropic spend cap** at console.anthropic.com to bound worst-case monthly API cost
while you gather per-export COGS data from Vercel function logs. Suggested cap: $50–100/month
until the B4 model switch (planner → Sonnet) is verified in production.

### 2. Connect the waitlist email provider

The `/api/waitlist` endpoint (built in PR #42) currently logs emails to Vercel function logs.
Wire it to a real email provider before launch so waitlist signups are captured:

**Recommended option (Resend):**
```bash
cd web && npm install resend
```
Then in `web/src/app/api/waitlist/route.ts`, replace the `console.log(...)` line with:
```ts
const resend = new Resend(process.env.RESEND_API_KEY);
await resend.contacts.create({
  email,
  audienceId: process.env.RESEND_AUDIENCE_ID,
  unsubscribed: false,
});
```
Add `RESEND_API_KEY` and `RESEND_AUDIENCE_ID` to Vercel env.

**Alternative**: Mailchimp, ConvertKit, Loops — each has a similar API. The endpoint already
validates the email; just swap the `console.log` with the provider's SDK call.

---

## Phase 2 — iOS App Store setup

### 3. Apple Developer Program + App Store Connect record

1. Enroll at developer.apple.com ($99/year for an individual account)
2. In Xcode, configure signing: set the Bundle ID `com.highlightmagic.app` (or your chosen ID)
   and assign the provisioning profile
3. In App Store Connect (appstoreconnect.apple.com), create a new app record:
   - Name: "Highlight Magic"
   - Bundle ID: matches Xcode signing
   - SKU: `HIGHLIGHTMAGIC-001` (your choice)
   - Primary language: English
4. Copy the App Store URL once the record is created and set it in Vercel env
   (`NEXT_PUBLIC_IOS_APP_STORE_URL`)

### 4. Create StoreKit live products

In App Store Connect → your app → In-App Purchases, create:

| Product ID | Type | Price | Purpose |
|---|---|---|---|
| `pro_monthly_999` | Auto-Renewable Subscription | $9.99/month | Pro tier (current default) |
| `pro_yearly_7999` | Auto-Renewable Subscription | $79.99/year | Annual plan (25% off monthly) |

The iOS app references these product IDs via StoreKit 2. Verify the IDs match
`Sources/Services/StoreKitService.swift` and update if they differ.

**Note**: Consider launching at $14.99/month instead of $9.99. See `docs/BUSINESS_CASE.md §3`
for the unit-economics rationale — $14.99 covers COGS more comfortably at typical usage.

---

## Phase 3 — App Store assets

### 5. Build + upload screenshots and preview video

The autonomous loop cannot run the iOS simulator. Using Xcode on a Mac with the iPhone 16
simulator (or a real device):

1. **Screenshots** (required formats):
   - 6.9-inch (iPhone 16 Pro Max): 1320 × 2868 px
   - 6.5-inch (iPhone 14 Plus / 13 Pro Max): 1284 × 2778 px
   - iPad Pro 12.9-inch (if submitting for iPad): 2048 × 2732 px

2. **Screenshot shotlist** (5 required screenshots, suggested order):
   1. Home / Upload screen — "Drop your footage, AI does the rest"
   2. AI detecting highlights — progress animation + detected moments UI
   3. Editor — trim + captions + filters in action
   4. Export preview — 1080×1920 vertical clip in the export step
   5. Pro/Paywall — "Go unlimited" screen

3. **App preview video** (optional but strongly recommended for ASO):
   - 15–30 seconds, 1080×1920 (portrait)
   - Shows the end-to-end flow: upload → detect → edit → export
   - Add music (royalty-free) and text overlays

Upload all assets in App Store Connect under the app record's metadata.

---

## Phase 4 — Domain + analytics

### 6. Point domain/DNS at Vercel

If you want `highlightmagic.app` (or your domain) to serve the web app:
1. In your domain registrar, add a CNAME record: `@ → cname.vercel-dns.com`
2. In Vercel dashboard, add the domain under Project Settings → Domains
3. Update `NEXT_PUBLIC_APP_URL` in Vercel env to the final domain

### 7. Connect analytics

Track E5 (analytics + funnel instrumentation) is built in the web app but needs a real
analytics destination:
- **Recommended**: Plausible Analytics (privacy-respecting, $9/month for up to 10K MAU)
  or Vercel Analytics (built-in, first 2,500 events/month free)
- Add the snippet/SDK and set the env var the instrumentation expects (see ROADMAP E5)

---

## Phase 5 — TestFlight + submission

### 8. TestFlight beta

1. Archive the app in Xcode (`Product → Archive`)
2. Upload to App Store Connect via Xcode Organizer
3. Add internal testers (up to 100 Apple IDs) in App Store Connect → TestFlight
4. Test the full flow on a real device: import → detect → export → share

### 9. App Store submission

Complete all required metadata in App Store Connect:
- App category: Photo & Video
- Content rating (complete the questionnaire; HighlightMagic should be 4+)
- Privacy Nutrition Labels (match the disclosures in `/privacy` — the policy is accurate to what's sent)
- Support URL: `https://highlightmagic.app/support`
- Privacy Policy URL: `https://highlightmagic.app/privacy`
- Submit for review

**Typical review time**: 1–3 business days for new apps.

---

## Phase 6 — Marketing launch

### 10. Fund content + ad accounts

Once the app is live:
1. **Content calendar**: The loop has drafted post batches and a calendar (Track E4). Execute it:
   post 2–3 demo videos/week to TikTok, Instagram Reels, and YouTube Shorts showing the
   app transforming raw footage into a viral clip.
2. **App Store Search Ads**: Start with a small budget ($200–500/month) targeting keywords
   from the ASO package (Track E3). Scale based on CPI and conversion.
3. **Waitlist email sequence**: Send a launch announcement to the waitlist captured at `/landing`.
   Subject line suggestion: "You're in — Highlight Magic is live on the App Store 🎉"

---

## Summary checklist

| # | Action | Phase | Unblocked when |
|---|---|---|---|
| ~~0a~~ | ~~iOS service-layer API key removal~~ | 0 | **COMPLETE** (PRs #80, #83, #84, #85) |
| 0b | Provision Vercel KV (Upstash Redis) + link to project | 0 | Code done (#66) — owner provisions KV in Vercel dashboard |
| 0c | App Store shared secret in Vercel env | 0 | After App Store Connect record (Step 3) |
| 1 | Set live API keys in Vercel | 1 | Now |
| 2 | Connect waitlist email provider | 1 | Now (PR #42 merged) |
| 3 | Apple Dev enrollment + App Store Connect record | 2 | Now |
| 4 | Create StoreKit live products | 2 | After Step 3 |
| 5 | Build + upload screenshots + preview video | 3 | After Step 3; needs Mac/Xcode |
| 6 | Point domain/DNS at Vercel | 4 | Now |
| 7 | Connect analytics destination | 4 | After domain is live |
| 8 | TestFlight beta | 5 | After Steps 3–5 |
| 9 | App Store submission | 5 | After Step 8 passes |
| 10 | Fund content + ad accounts | 6 | After app is live (Step 9) |

Phase 0 items are factory-buildable but partially deferred (iOS Swift compile verification is not
possible on Linux; KV provisioning requires owner action). All Phase 1–6 items require Apple
Developer credentials, live billing accounts, a physical Mac with Xcode, or funded ad accounts.
