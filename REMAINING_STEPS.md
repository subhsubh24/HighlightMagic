# Remaining Steps — Owner-Only Actions (in order)

This file lists, in the exact order the owner should execute them, the actions the autonomous
loop physically cannot take. Everything the loop *can* build has been built or is tracked in ROADMAP.md.

Keep this current: as the loop completes prerequisites, steps here become unblocked and should
be executed. Last updated: 2026-07-05 (Run 52).

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

### 0c. Apple root CA for Pro entitlement verification

`verifyProEntitlement()` in `web/src/lib/entitlement.ts` cryptographically verifies the StoreKit 2
signed transaction (JWS) the app passes up: it checks the `x5c` certificate chain against Apple's
public root CA, validates the ES256 signature, and confirms the transaction is a Pro SKU, unexpired
and unrevoked. No Apple *secret* is needed to verify — only Apple's PUBLIC root CA, which the loop
cannot fetch (apple.com is blocked from the build egress), so the owner supplies it:

1. Download **"Apple Root CA - G3"** (`.cer`, DER) from https://www.apple.com/certificateauthority/
   and convert to PEM: `openssl x509 -inform DER -in AppleRootCA-G3.cer -out AppleRootCA-G3.pem`.
2. Add it to Vercel env as `APP_STORE_ROOT_CA_PEM` (the full PEM block; may hold several
   concatenated certs). Until it is set, EVERY user is treated as free-tier and the monthly limit
   is enforced for all (secure default).
3. (Optional, recommended) Add `APP_STORE_BUNDLE_ID=<your bundle id>` to harden the check so only
   transactions for this app are accepted.

DONE (loop, #114): the iOS client now attaches its StoreKit signed transaction
(`result.jwsRepresentation`) to the entitlement-gated backend calls (ios-score, ios-plan), so the
gate receives input. The only remaining step is owner-supplied — set `APP_STORE_ROOT_CA_PEM` above.

### 0d. iOS enhancement-generation (audio/video) — route through the gated backend + fix the dead toggles

**LOOP-DEFERRED (loop CAN build this).** Scope clarification: item 0a's "iOS key removal COMPLETE
(Run 19)" covered only the 4 **Anthropic** services. The **ElevenLabs + AtlasCloud** services held
their OWN provider-key resolution (env/Keychain/Info.plist) and would have called those providers
directly. **#180 (Run 27)** hard-disabled that path (`apiKey→nil`, `isAvailable→false`), closing the
App Store credential risk + server-gate bypass. CONSEQUENCE: the iOS enhancement features that depend
on them — **AI Music, Voiceover, SFX, Intro/Outro cards, Voice Clone, Stem Separation, Style Transfer**
— are now (and were already in production, since no key is bundled) **dormant**. Two follow-ups remain:

1. **Backend-route these features** through the gated web backend (analogous to the existing
   `/api/ios-score`, `/api/ios-plan`, `/api/ios-validate`), so Pro users actually get them and the spend
   stays server-gated. This is the proper restoration path.
2. **EditorView dead-UI** (flagged by Reviewer B on #180): until (1) lands, `EditorView` still shows
   these toggles as ENABLED with no `isAvailable` guard, so a user can flip one and the feature silently
   does nothing (BUILDS≠WORKS). Interim fix: hide or `.disabled()` the affected toggles with a
   "Coming soon" affordance. (iOS UI change — gated by the `ios` check; edit conservatively.)
3. **Bundled music library is ALSO non-functional** (root cause found Run 34, DEEP AUDIT): the
   `MusicPickerSheet` + `MusicLibrary.tracks` (14 named tracks) is a SEPARATE dormancy from the ElevenLabs
   AI-music path above — **no audio files are committed anywhere in the repo** (zero `.mp3`/`.m4a`/`.wav`,
   confirmed via `git log --all --diff-filter=A`), so `MusicTrack.bundleURL` is always `nil`,
   `ClipGenerationService`'s music-insertion branch is unreachable, and `BeatSyncService` returns a
   synthetic metronome grid. An export gets **no music today**, and the picker is build-but-broken. Fix
   is EITHER: **(owner)** bundle licensed royalty-free `.mp3` tracks whose filenames match
   `MusicLibrary.tracks` `fileName` values (e.g. `summer_vibes.mp3`) into the app bundle (SPM
   `Sources/Resources` or an Xcode asset location) — this makes the picker + beat-sync work; **OR (loop)**
   hide the music picker like (2) until assets exist. Marketing docs (ASO/press/content/landing) were
   corrected Run 34 (#223/#224/#225) to stop claiming music works until this is resolved.

**What the owner can do to unblock**: (1)+(2) are loop work; (3)'s asset-bundling is owner-only
(licensed audio files the loop cannot create) — see also Phase 3.

---

### 0e. AppStoreMetadata.swift honesty rewrite — ✅ DONE (Run 36, #233)

**RESOLVED by the loop (#233, Run 36).** `Sources/Utilities/AppStoreMetadata.swift` was rewritten
(string-literal-only, gated by the `ios` check — merged green) to match the shipped binary: the false
App Review Notes paragraph ("music, sound effects, and voiceover are generated by ElevenLabs; …
intro/outro video cards are generated by AtlasCloud (Kling)") was replaced with the truth (editor
features are deterministic + on-device; the only server-side AI is frame-scoring detection); all "14 / 5
royalty-free music tracks", "music mood", "cinematic LUTs", "particle overlays" claims were removed from
the description, `whatsNew`, free/Pro plan bullets, and the screenshot set (music-picker screen → style-
templates screen); "Unlimited exports" → "Unlimited monthly exports (50/day fair-use ceiling)"; and the
false CONTENT-section licensed-music line was removed. An independent reviewer verified every retained
claim against source (8 templates match `TemplateLibrary`; kinetic captions/color filters map to real
enums; "premium filters & effects" maps to the real `PremiumEffectRenderer`; the pass-count language is
accurate (the store copy was later refined "7-Pass"→"6-Pass" in #410 to match the six user-visible
`ProcessingView` passes — the backend runs seven stages); iCloud sync is wired). No new inaccuracy introduced.

**What the owner should still do**: at submission, copy this now-honest metadata into App Store Connect
and re-confirm it against the final shipped build. NOTE (Run 47, #342): a subsequent honesty pass also
removed the unbacked "Priority processing" Pro bullet from this file (and the landing pricing card) — no
tier/queue prioritization exists, so re-confirm the copied metadata does not reintroduce it.

---

### 0f. E8 experiment-engine live wiring — loop follow-up (no owner action)

**ENGINE BUILT (Run 47, #340)** — `web/src/lib/growth/experiments.ts` (sticky assignment + KV aggregate
store + two-proportion lift with a min-sample gate), the public beacon `/api/growth/experiment`, and the
E7 wiring are all merged + tested. What REMAINS is loop work (NOT owner): wire `assignVariant` into an
actual landing render (e.g. the registered `landing-headline` hero-copy experiment) and fire the
exposure/conversion beacon, so a designed A/B test actually RUNS. Deferred because pre-launch there is no
traffic to measure; a future run wires it once the site is live (and, at that point, hardens the beacon
against client-reported-conversion flooding — see LOOP_MEMORY Run 47).

**What the owner can do to unblock**: nothing — this completes automatically as launch traffic arrives and
the loop wires the first live experiment.

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

### 2b. Bot protection on the waitlist form (Cloudflare Turnstile — H5)

Both halves are now **built** (H5 complete in code, #187 Run 29): the server verifies the token in
`/api/waitlist` (when `TURNSTILE_SECRET_KEY` is set — 5s timeout, fails open if Cloudflare is
unreachable, returns 400 `"CAPTCHA required."` on a missing/invalid token), AND the landing
`WaitlistForm` renders the Turnstile widget + sends `cfTurnstileToken` whenever
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set (with a CSP `frame-src` for the challenge iframe). With
neither key set (current prod state) the form is unchanged. **Owner steps to activate:**
1. Create a Turnstile widget at the Cloudflare dashboard → get the **Site Key** (public) + **Secret Key**.
2. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public) **and** `TURNSTILE_SECRET_KEY` (server) **together**
   in Vercel env — never the secret alone (the secret alone would 400 every signup since the public
   key gates whether the widget renders the token).

### 2c. Wire the ElevenLabs + AtlasCloud evals into the weekly live-eval workflow

The eval SCRIPTS + unit-tested rubric are **built** (#353): `web/src/evals/elevenlabs.eval.ts`
(TTS) and `web/src/evals/atlascloud.eval.ts` (Kling video), both `EVAL_MODE=1`-gated exactly like
the existing Anthropic eval, with the per-run `EVAL_MAX_USD` cost ceiling implemented in code
(aborts before any paid call). They run manually today; the loop **cannot** edit `.github/`, so
activating them on the weekly cadence is an owner step:

1. In `.github/workflows/live-eval.yml`, add a step for each new eval, guarded exactly like the
   existing Anthropic step (`if: ${{ env.ELEVENLABS_API_KEY != '' }}` / `... ATLASCLOUD_API_KEY ...`),
   invoking `npx tsx web/src/evals/elevenlabs.eval.ts` and (for video) `web/src/evals/atlascloud.eval.ts`.
2. Set the workflow env for the video eval: `EVAL_MODE=1`, `RUN_VIDEO_EVAL=1`, and optionally
   `EVAL_MAX_USD` (defaults to $1 in code). Put the video eval on the weekly cadence ONLY once the
   provider spend cap below is confirmed (per ROADMAP G3 cost governance).
3. Confirm the owner-funded eval keys (`validation-eval-keys`) AND provider hard spend caps are set
   before the video eval runs unattended — the priciest call must never sit on a timer without a cap.

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
| `pro.monthly` | Auto-Renewable Subscription | $14.99/month | Pro tier |
| `pro.yearly` | Auto-Renewable Subscription | $149.99/year | Annual plan (2 months free, ~17% off monthly) |
| `credits.small` | Consumable | owner-set (suggest ~$2.99) | Export credit pack — grants **10** extra exports |
| `credits.medium` | Consumable | owner-set (suggest ~$6.99) | Export credit pack — grants **30** extra exports |
| `credits.large` | Consumable | owner-set (suggest ~$14.99) | Export credit pack — grants **100** extra exports |

The iOS app references the subscription product IDs via StoreKit 2. The subscription prices are the
live, business-case price (matched across `Sources/Resources/StoreKitConfiguration.storekit`, the web
landing page, and `docs/aso-package.md`); configure the App Store Connect products at exactly these
prices. Verify the IDs match `Sources/Services/StoreKitService.swift`.

**Export credit packs (consumables) — backend DONE (#237), iOS half is the remaining work.** The
server-side redemption is built + fully tested: `web/src/lib/constants.ts` `CREDIT_PACK_PRODUCTS` is
the authoritative credits-per-pack map (10/30/100), and `POST /api/credits/redeem` cryptographically
verifies the StoreKit consumable transaction (Apple-anchored JWS, idempotent by transactionId) and
grants durable credits that `checkExportAllowed`/`consumeExport` spend once the free monthly limit is
hit. To finish the lever: **(owner)** create the three consumable products above in App Store Connect
at your chosen prices (the credit COUNTS are fixed server-side; only PRICE is owner-set — price to
value/benchmarks, don't undercut the per-export COGS). **(loop, at submission)** build the iOS
StoreKit consumable purchase UI (offered at the free-limit paywall moment) and POST the signed
transaction to `/api/credits/redeem`; keep the product IDs in sync with `CREDIT_PACK_PRODUCTS`.
Also **(loop/owner, before the packs go purchasable)** run a one-time **live-KV sandbox redemption
round-trip**: `credit-store.ts` `grant()` now claims the idempotency marker and increments the
balance in a single atomic `kv.eval` Lua script (#350), and the unit tests mock `kv.eval` — so the
Lua/RESP behavior can only be proven against a real Vercel KV instance. Redeem a sandbox consumable
end-to-end (grant → balance persists → replay returns duplicate, no double-grant) once KV is
provisioned, before enabling the consumable products.

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
| 0c | Apple Root CA - G3 PEM in Vercel env (`APP_STORE_ROOT_CA_PEM`) | 0 | After App Store Connect record (Step 3) |
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
