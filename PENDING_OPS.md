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

## Server-Side Quota (B3 prerequisite)

Free tier enforcement (5 exports/user/month) is currently CLIENT-SIDE ONLY in the iOS app
(`AppState.exportsUsedThisMonth` in UserDefaults). This can be bypassed by reinstalling the
app or modifying client state.

To enforce server-side:
1. Add **Vercel KV** (Redis) to the Vercel project
2. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars (Vercel provides these automatically)
3. Implement `/api/quota/check` and `/api/quota/increment` endpoints that read/write
   `quota:{userID}:{YYYY-MM}` keys with a 31-day TTL
4. Call `quota/check` at the start of the detection pipeline; call `quota/increment` on
   successful export; return HTTP 402 if limit is exceeded for free users

## P0 — iOS API Keys (Cost + Security)

The iOS app currently calls `api.anthropic.com` DIRECTLY using a key from env/Keychain.
This means anyone who extracts the Keychain key can run up the API bill.

Decision needed: **bring-your-own-key (BYOK)** or **business-paid**?
- If BYOK: document this clearly in onboarding; the current implementation is already
  functionally correct; add a Settings UI for users to enter their own key.
- If business-paid: route all iOS API calls through the `web/` backend (add `/api/detect`
  proxy); remove key storage from the iOS app; enforce quota server-side before each call.

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

The `ios` CI job is non-blocking because `HighlightMagic.xcodeproj/project.pbxproj` has
`targets = ()` — no buildable target exists. Once the owner promotes `ios` to a required
check (after A1 is fixed), the factory will enforce iOS CI green on every merge.

The factory cannot interactively test xcodebuild (Linux runner, no Xcode). A1 work must be
validated on macOS. The PR for A1 will be opened for CI validation.

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

The `Sources/HighlightMagic.entitlements` exists but `PrivacyInfo.xcprivacy` has not been
created. This is required by App Store (required reason APIs, NSPrivacyAccessedAPITypes).
Check which APIs the app uses and document them.

## Marketing / Web

- Connect and fund social / ad accounts before publishing the landing page / waitlist
- The `web/` landing page is staged; do not publish paid traffic until Pro subscription
  is live in App Store Connect
