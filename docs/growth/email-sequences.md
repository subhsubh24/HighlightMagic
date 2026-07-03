# Email Sequences — Highlight Magic

Lifecycle email drafts for the waitlist → launch → activation → conversion → win-back funnel.
Build + stage only — owner wires to the email provider (Resend / SendGrid / Mailchimp).
See `docs/growth/CONNECT.md` for the provider connection steps.

**Voice**: confident, direct, peer-to-creator. Lead with the outcome. Short sentences. No hype.  
**Product facts** (never contradict): 5 free exports/month with watermark; Pro at $14.99/month or $149.99/year — unlimited exports, no watermark.  
**Social proof**: never invented. Leave blank until real examples exist.

---

## Sequence 1: Pre-Launch Waitlist

Trigger: signup on landing page waitlist form.

### EMAIL 1A — Welcome (send immediately on signup)

**Subject**: You're in — here's what's coming  
**Preview text**: 5 free exports every month, no card required

---

Hey —

You're on the Highlight Magic waitlist.

Here's what that means: when we launch, you get in first. And you get 5 free exports every month — no card required.

**What is Highlight Magic?**

Import your raw footage — a game, a trip, a concert — and AI finds the moments worth sharing. No scrubbing. No editing. You get a ready-to-post highlight in under a minute.

We're in the final stage of testing. Launch is coming soon.

One thing you can do right now: **share this with a creator friend** who's spending hours editing footage they should be spending 30 seconds on.

[Share the waitlist → https://highlightmagic.app/landing]

See you at launch.

— The Highlight Magic team

---

P.S. Have a use case you're excited about — sports, travel, concerts? Reply and tell us. We read every response.

---

### EMAIL 1B — Pre-Launch Nurture #1 (send Day 7 after signup; or 1 week before launch if launch is sooner)

**Subject**: AI found the goal. And the trip wire. And the crowd reaction.  
**Preview text**: See what the detection actually does

---

Hey —

Most video editing apps make you find the moments yourself. You scrub. You mark. You trim.

Highlight Magic doesn't work that way.

The AI samples and scores frames across your footage — looking for the moments that matter: the score, the crowd, the drop, the laugh. Then it builds the highlight.

You don't touch the timeline.

**Here's what you get on the free plan:**
- Automatic highlight selection from hours of footage
- AI-synced music, sound effects, and captions
- Export in 9:16 for TikTok, Reels, and Shorts
- 5 exports per month

**Upgrade to Pro ($14.99/month) and also get:**
- Unlimited exports
- No watermark on your highlights

[See it in action → https://highlightmagic.app/landing]

We launch soon. You're first in line.

— The Highlight Magic team

---

### EMAIL 1C — Pre-Launch Urgency (send 48 hours before launch — manual trigger)

**Subject**: 48 hours. Then it's live.  
**Preview text**: You're on the early access list — here's what to expect

---

Hey —

Highlight Magic goes live in 48 hours.

As a waitlist member, you're first. When the App Store listing is live, you'll get the link here before anywhere else.

**What you're getting:**
- 5 free exports per month — no card required
- AI highlight detection from your raw footage
- Music, captions, and sound effects — automatically
- Export ready to post to TikTok, Reels, or Shorts

Pro is $14.99/month (unlimited exports, no watermark). Start free — no commitment.

Watch for the launch email in 2 days.

— The Highlight Magic team

---

## Sequence 2: Launch Day

Trigger: app is live in App Store. Owner manually fires this broadcast.

### EMAIL 2A — Launch Day (send on launch day)

**Subject**: It's live — your first 5 exports are free  
**Preview text**: Download Highlight Magic now on the App Store

---

Hey —

It's live.

Highlight Magic is in the App Store. You're first on the list, so you get first access.

[Download Highlight Magic — Free →]  
[APP STORE LINK — owner inserts before sending]

**How to make your first highlight:**
1. Open the app
2. Import a video — a game, a trip, anything
3. Tap "Generate Highlight"
4. Export. Done.

Your first 5 exports are free every month. No card, no commitment.

If you want unlimited exports and no watermark, Pro is $14.99/month or $149.99/year.

Go make something worth sharing.

— The Highlight Magic team

---

P.S. If you make a highlight you're proud of — tag #HighlightMagic when you post it. We'll repost our favorites.

---

## Sequence 3: Activation

Trigger: user installed the app but has not completed a first export after 3 days.

> ⚠️ **Infrastructure note**: This email requires reliable behavioral tracking — confirmed install date + export count — piped into your email provider. Do NOT activate this sequence until you have verified the data pipeline end-to-end. Sending to users who have already exported will erode trust. Until verified, use time-since-signup as a proxy trigger (Day 10 from signup with no App Store install activity).

> **Recommended addition (not in this batch)**: add a Day 1 micro-nudge (6–12 hours post-install with no export) — a single short line: "Your first free highlight takes 60 seconds. Open Highlight Magic →". Day 1 drop-off is the steepest; catching it early outperforms the Day 3 step-by-step email.

### EMAIL 3A — Activation Nudge (Day 3 post-install, no export)

**Subject**: Still haven't made your first highlight?  
**Preview text**: Takes less than a minute — here's how

---

Hey —

You downloaded Highlight Magic — but you haven't made your first highlight yet.

It takes less than a minute. Here's exactly how:

**Step 1**: Open the app. Tap the + button.  
**Step 2**: Pick any video — even a short clip works.  
**Step 3**: Tap "Generate Highlight" and let AI run.  
**Step 4**: Export. Done.

No editing required. The AI does it.

The first 5 are free every month. Try it with anything — a clip from your camera roll, a game you filmed, even a vacation video you've never posted.

[Open Highlight Magic →]  
[APP DEEP LINK — owner inserts]

— The Highlight Magic team

---

## Sequence 4: Conversion

Trigger: user approaches or hits the 5-export free limit.

> ⚠️ **Infrastructure note**: Emails 4A and 4B are most effective when triggered by actual export events (server-side quota tracking). Until Vercel KV + auth are provisioned (PENDING_OPS: server-quota-infra), use time-based proxies: send 4A at Day 14 post-install, 4B at Day 21.

### EMAIL 4A — Approaching Limit (when user completes 4th free export)

**Subject**: You've made 4 highlights — one free export left this month  
**Preview text**: Upgrade now and keep going without interruption

---

Hey —

You've made 4 highlights with Highlight Magic. One free export left this month.

If you want to keep going without limits:

**Highlight Magic Pro — $14.99/month**
- Unlimited exports
- No watermark on your highlights

Or go annual: **$149.99/year** — that's $12.50/month, 2 months free.

[Upgrade to Pro →]  
[APP STORE SUBSCRIPTION LINK — owner inserts]

If you're not ready to upgrade, your 5th free export is still there. Use it on something good.

— The Highlight Magic team

---

### EMAIL 4B — Limit Hit (when user completes 5th free export)

**Subject**: You've hit your free limit — here's what's next  
**Preview text**: Upgrade to keep making highlights this month

---

Hey —

You've used your 5 free exports for the month.

If you want to keep going now, Pro unlocks unlimited exports:

**$14.99/month** — cancel any time  
**$149.99/year** — 2 months free ($12.50/month effective)

[Upgrade to Pro →]  
[APP STORE SUBSCRIPTION LINK — owner inserts]

Your free exports reset at the start of next month. If you can wait, they'll be back then.

But if you've got footage to turn into highlights now, Pro removes the limit entirely.

— The Highlight Magic team

---

## Sequence 5: Win-Back

Trigger: user signed up (or installed) 30+ days ago; has not converted to Pro; has not exported in 14+ days.

### EMAIL 5A — Win-Back (Day 30 from install, no Pro, no recent export)

**Subject**: You haven't made a highlight in a while  
**Preview text**: Your footage is waiting — and your free exports reset every month

---

Hey —

It's been a while since you used Highlight Magic.

You've got footage you never got around to editing — a game, a trip, something worth sharing — that could be a ready-to-post highlight in under a minute.

That's what Highlight Magic is for. One minute. AI does the edit.

**Your free exports reset every month.** If you haven't used this month's, they're waiting.

[Make a highlight now →]  
[APP DEEP LINK — owner inserts]

If you want unlimited exports going forward, Pro is $14.99/month or $149.99/year.

— The Highlight Magic team

---

## Sequence timing summary

| Email | Trigger | Timing |
|---|---|---|
| 1A Welcome | Waitlist signup | Immediately |
| 1B Nurture | Waitlist (if launch > 7 days out) | Day 7 after signup |
| 1C Urgency | Waitlist (manual) | 48 hours before launch |
| 2A Launch | App Store live (manual broadcast) | Day 0, launch day |
| 3A Activation | Install, no export | Day 3 post-install (or Day 10 from signup as proxy) |
| 4A Approaching limit | 4th free export used | On event (or Day 14 post-install as proxy) |
| 4B Limit hit | 5th free export used | On event (or Day 21 post-install as proxy) |
| 5A Win-back | No export 14d + no Pro | Day 30 from install |

---

## Provider implementation notes (for E6b)

**Resend** (recommended): use Audiences API for the waitlist list; Broadcast for 1A/1B/1C/2A; Automations for 3A/4A/4B/5A triggered by export events from the backend.

**Mailchimp**: standard Audience + Customer Journey automations.

**SendGrid**: Marketing Campaigns for broadcasts; Event Webhooks from the backend for triggered sequences.

**Behavioral triggers** (3A, 4A, 4B, 5A) require the backend to emit events to the email provider when exports happen. These events should be emitted from the quota tracking routes once Vercel KV + auth are live (PENDING_OPS: server-quota-infra).

**Social proof retrofit** (recommended as soon as possible): once real users have made shareable highlights, add an example — a video thumbnail of a highlight that performed well — into Email 1B or 2A. Visual proof of output quality is the strongest conversion tool for a creative product and is absent from this sequence until real examples exist.

**Objection-handling gap**: this sequence converts believers but not skeptics. Once beta feedback is available, add a line in 1B or 3A that pre-empts the key hesitation: "If you're not sure AI can pick the right moments — here's what the output actually looks like" with a real example. Do not add until a real, shareable example exists.

*Last updated: 2026-06-27 (Growth Agent Run 1). Adversarially reviewed before merge; 6 blockers resolved.*
