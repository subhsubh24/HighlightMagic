# CONNECT — Growth Channel Connection Runbook

**Owner: ~20 minutes per channel.** This runbook tells you exactly which environment variables
and OAuth connections to set per channel to switch the Growth Agent from prepare-only mode into
execute mode.

The Growth Agent NEVER holds live secrets. The deployed `web/` backend sends; you connect.

Until a channel's credentials are present in Vercel env, that channel stays in DRY-RUN mode
and GROWTH_STATUS shows `awaiting_connect: true`.

> **Engine status (E6 built — 2026-06-27):** the execution plumbing is LIVE in `web/` —
> waitlist capture + double-opt-in (`/api/waitlist` → `/api/waitlist/confirm`), the email
> provider abstraction (`web/src/lib/email/`), the social publishing queue
> (`web/src/lib/social/queue.ts`), and the analytics-pull read-API (`/api/growth/stats`,
> consuming `web/src/lib/growth/metrics.ts`). Everything is dry-run-safe and no-ops until
> you set the env vars below — **no further product-loop build work is needed to go live**,
> just connect creds and redeploy.

---

## Overview: what each channel unlocks

| Channel | What it enables | Required env var(s) |
|---|---|---|
| **Email (Resend)** | Transactional confirm/welcome emails fire automatically; lifecycle broadcasts ready to wire | `RESEND_API_KEY` (required); `RESEND_AUDIENCE_ID` (optional — only for the nurture/broadcast sequences) |
| **CAPTCHA (Cloudflare Turnstile)** | Bot protection on the public waitlist form | `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |
| **Waitlist datastore (Vercel KV)** | Signups saved permanently (not just logged) | auto-set by Vercel after provisioning |
| **Analytics pull (E6d)** | GROWTH_STATUS gets real funnel numbers each run | `GROWTH_AGENT_SECRET` + E6d backend build |
| **Backend AI (Anthropic/ElevenLabs/AtlasCloud)** | All AI detection and generation in production | `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ATLASCLOUD_API_KEY` |
| **App Store + StoreKit** | Pro subscriptions work in production; revenue | Apple Developer account + App Store Connect |

Social posting (X, Instagram, TikTok, Reddit): the publishing queue (E6c) is built and
dry-run-safe (`web/src/lib/social/queue.ts`) — it accepts drafts and refuses to post until a
channel's API credentials are set. A live per-channel poster is wired when you connect that
channel's keys (`X_API_BEARER_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `TIKTOK_ACCESS_TOKEN`,
`REDDIT_ACCESS_TOKEN`).

---

## Step 1 — Email: Resend (highest ROI, do first)

Resend is recommended: free tier (100 emails/day), clean API, native Next.js support. The
email provider abstraction (`web/src/lib/email/`) already speaks Resend — setting
`RESEND_API_KEY` flips it out of dry-run automatically; no code change required.

### Setup
1. Create a free account at resend.com
2. Verify your domain:
   - Resend dashboard → Domains → Add Domain → enter `highlightmagic.app`
   - Add the DNS records Resend provides (2 TXT records + 1 MX record) to your domain registrar
   - Click Verify — takes ~5 minutes to propagate
3. Create an API key:
   - Resend dashboard → API Keys → Create Key → name it "highlightmagic-production" → Full Access
   - Copy the key immediately (shown only once)
4. Set env vars in Vercel:
   - Vercel dashboard → your web/ project → Settings → Environment Variables
   - Add `RESEND_API_KEY` = (key from step 3) — this alone enables the transactional
     confirm/welcome emails the waitlist sends.
   - Set environment: Production (and Preview if you want)
5. Redeploy: Vercel → Deployments → Redeploy (env vars only take effect on new deploys)

> **Optional — nurture/broadcast sequences:** to also run the lifecycle drafts in
> `docs/growth/email-sequences.md` as Resend Broadcasts/Automations, create an Audience
> (Resend → Audiences → Create Audience) and set `RESEND_AUDIENCE_ID`. The transactional
> double-opt-in flow does NOT require it.

### Test
```
curl -X POST https://your-project.vercel.app/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"your-own-email@example.com"}'
```
Should return `{"ok":true}`. Check Resend Audience — contact should appear.

### That's it — no build needed
Once `RESEND_API_KEY` is set and you redeploy, the waitlist route sends a double-opt-in
confirmation email on every signup automatically (E6b is built). The email sequence drafts
are in `docs/growth/email-sequences.md` — wire them as Resend Broadcasts (emails 1A–2A) and
Automations (emails 3A–5A) against the audience your confirmed signups land in.

---

## Step 2 — CAPTCHA: Cloudflare Turnstile (protects waitlist from bot floods)

Free for all sites. The waitlist route already checks for `TURNSTILE_SECRET_KEY` — if the env
var is present, CAPTCHA is enforced automatically.

### Setup
1. Create a free Cloudflare account at cloudflare.com (no need to move your DNS)
2. Cloudflare dashboard → Turnstile → Add Site
   - Site name: "Highlight Magic Waitlist"
   - Domain: `highlightmagic.app`
   - Widget type: Managed (invisible to real users, stops bots)
3. Copy the **Site Key** and **Secret Key**
4. Set env vars in Vercel:
   - `TURNSTILE_SECRET_KEY` = (Secret Key — server-side only, never expose)
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = (Site Key — safe to be public)
5. Redeploy

### Tell the product loop
> "TURNSTILE_SECRET_KEY and NEXT_PUBLIC_TURNSTILE_SITE_KEY are set. Please add the Cloudflare
> Turnstile widget to the landing page waitlist form (web/src/app/landing/page.tsx)."

---

## Step 3 — Waitlist datastore: Vercel KV

Without this, waitlist signups are only in Vercel function logs (retained ~7 days). KV stores
them permanently and is the prerequisite for server-side quota (B3) and analytics pull (E6d).

### Setup
1. Vercel dashboard → your project → Storage tab → Create Database → KV
2. Name it `highlightmagic-kv`
3. Vercel automatically sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` as env vars
4. Redeploy

### That's it — no build needed
Once Vercel KV is provisioned and you redeploy, `/api/waitlist` persists each signup to KV
automatically (`waitlist:emails` set + per-token pending keys; E6a is built) and
`/api/growth/stats` (E6d, protected by `GROWTH_AGENT_SECRET`) returns the real signup +
confirmation counts. Set `GROWTH_AGENT_SECRET` so the Growth Agent can read them.

Also set `GROWTH_AGENT_SECRET` in Vercel to any random 32-character string — the Growth Agent
will use it to call /api/growth/stats and pull real funnel numbers each run.

---

## Step 4 — Backend AI API keys (required for any AI functionality in production)

All AI calls route through the `web/` backend. Without these keys, every detection and
generation call fails silently in production.

**Set spend caps FIRST — then enter keys:**

| Step | Where |
|---|---|
| 1. Set hard monthly cap + 50% alert | console.anthropic.com → Billing → Usage Limits |
| 2. Set usage cap | elevenlabs.io → Account → Billing |
| 3. Set spend cap | AtlasCloud dashboard |
| 4. Set `ANTHROPIC_API_KEY` in Vercel | Vercel → Settings → Environment Variables |
| 5. Set `ELEVENLABS_API_KEY` in Vercel | same |
| 6. Set `ATLASCLOUD_API_KEY` in Vercel | same |

> ⚠️ Suggested initial caps: Anthropic $50–100/month while monitoring per-export costs from
> Vercel logs. Scale up once you know actual per-export COGS from real traffic.

---

## Step 5 — App Store + StoreKit (required for Pro revenue)

1. Enroll in Apple Developer Program: developer.apple.com ($99/year)
2. Register App ID `com.highlightmagic.app` in the Apple Developer portal
3. App Store Connect → My Apps → New App → iOS, bundle: `com.highlightmagic.app`
4. Create subscriptions:
   - Subscriptions → + → name "Highlight Magic Pro Monthly", ID: `pro.monthly`, price: $14.99/month
   - Subscriptions → + → name "Highlight Magic Pro Annual", ID: `pro.yearly`, price: $149.99/year
5. Set `APP_STORE_ROOT_CA_PEM` in Vercel (Apple Root CA, PEM format — needed for JWS verification)
6. Set `DEVELOPMENT_TEAM` in Xcode to your Apple team ID

See REMAINING_STEPS.md for the full ordered checklist.

---

## Verifying execute mode is active

After connecting Resend + KV and having the product loop wire E6a + E6b:

1. Sign up on the landing page with a test email
2. Check Resend Audience — email should appear within 5 seconds
3. Check Vercel KV — email should be in the `waitlist:emails` set
4. On the next Growth Agent run, GROWTH_STATUS should show:
   - `channels_connected: [email]`
   - `awaiting_connect: false`
   - `email.list_size: [real number]`
   - `waitlist_signups_total: [real number]`

If GROWTH_STATUS still shows 0 after connecting, double-check that `KV_REST_API_URL` /
`KV_REST_API_TOKEN` and `GROWTH_AGENT_SECRET` are set in the **Production** environment and
that you redeployed — E6a (KV write) and E6d (stats API) are already built and live.

---

*Last updated: 2026-06-27 (Growth Agent Run 1).*
