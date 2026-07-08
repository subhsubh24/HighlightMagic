# Highlight Magic — Brand Kit

Living reference for all brand decisions. Updated by the autonomous loop as assets ship.  
**Owner action required**: export SVG assets to PNG/WEBP at required sizes before App Store submission (see E3 shotlist).

---

## 1. Name & Wordmark

**App name**: Highlight Magic  
**Tagline**: *Turn Raw Video Into Viral Highlights*  
**Short form** (notifications, home screen): *Highlights*  
**Domain**: highlightmagic.app

### Usage rules
- Always two words, title-case: **Highlight Magic** — never HighlightMagic, highlight magic, or HIGHLIGHT MAGIC in marketing copy
- "HighlightMagic" (no space) is acceptable in technical/code contexts (bundle ID, API keys, GitHub) only
- Tagline: always sentence case, present tense, action-oriented

---

## 2. Color System

Ported from iOS `Theme.swift` and web `globals.css`. All tokens are production-deployed.

| Token | Hex | Role |
|---|---|---|
| `--bg-primary` | `#0F0A1A` | App background; hero sections |
| `--bg-secondary` | `#1A1128` | Card/section backgrounds |
| `--accent` | `#7C3AED` | Primary brand purple; CTAs; icons |
| `--accent-hover` | `#6D28D9` | Hover state for CTAs |
| `--accent-pink` | `#EC4899` | Gradient terminus; energy/excitement |
| `--text-primary` | `#FFFFFF` | Headings, primary body |
| `--text-secondary` | `rgba(255,255,255,0.70)` | Body, descriptions |
| `--text-tertiary` | `rgba(255,255,255,0.50)` | Placeholders, helper text (WCAG-AA 5.29:1 on `--bg-primary`) |
| `--success` | `#22C55E` | Confirmations, checkmarks |
| `--warning` | `#F59E0B` | Warnings |
| `--error` | `#EF4444` | Error states |

### Signature gradient
`135deg, #7C3AED → #EC4899` — used on buttons, icons, and gradient text.  
Usage: primary CTA buttons, the app icon background, hero accent glows, and gradient headlines.

### Dark-mode only
Highlight Magic is dark-mode only. Do not produce light-mode variants — the brand identity is built on the deep violet-black palette.

---

## 3. Typography

| Context | Font | Weight | Notes |
|---|---|---|---|
| Primary (iOS) | SF Pro (system) | Various | Apple default; no download needed |
| Primary (web) | `-apple-system, BlinkMacSystemFont, "SF Pro", "Segoe UI", Roboto, sans-serif` | — | System font stack |
| Hero headline | System / SF Pro | 800–900 (ExtraBold/Black) | 48–72 pt on iOS; 48–72 px on web |
| Section headline | System / SF Pro | 700 (Bold) | 28–36 pt/px |
| Body | System / SF Pro | 400 (Regular) | 15–17 pt/px, 1.6 line-height |
| Label / caption | System / SF Pro | 600 (SemiBold) | 12–14 pt/px, ALL CAPS for step numbers |

**Kinetic text overlays** (in-app export captions): Bold + uppercase, high contrast white on dark, drop shadow.

---

## 4. Logo & App Icon

### Primary mark
A ✦ sparkle glyph (or similar "magic spark") centered in a rounded-square container filled with the signature gradient (`#7C3AED → #EC4899`, 135°).

**Rasterize to**:
- 1024×1024 px PNG — App Store icon (no transparency)
- 512×512 px PNG — general use
- 192×192 px PNG — web PWA icon (`web/public/icons/icon-192.png`)
- 180×180 px PNG — Apple Touch Icon
- 32×32 px PNG — favicon
- 16×16 px PNG — browser favicon fallback

### Clear space
Maintain a minimum clear space of 10% of the icon size on all sides. Never place text or other elements within this zone.

### Usage don'ts
- Do not recolor the icon in a single flat color
- Do not use the icon on a white/light background (dark-mode only brand)
- Do not stretch, rotate, or skew the icon
- Do not add drop shadows to the icon itself (the gradient provides sufficient depth)

---

## 5. OG / Social Share Images

**Usage**: Open Graph image for Twitter/X card and Facebook/LinkedIn link previews.

**Design spec** (1200×630 px):
- Background: `#0F0A1A` with a subtle radial purple glow center-left
- Left half: app icon (256×256) + wordmark "Highlight Magic" in white bold + tagline in `--text-secondary`
- Right half: mockup of a phone frame showing a vertical clip editor screen (screenshot placeholder until owner provides real screenshot)
- Bottom: "Available on the App Store — Free to start" in small white text
- Gradient bar (2 px, full width) along the top edge: `#7C3AED → #EC4899`

**Twitter card type**: `summary_large_image` (already set in `web/src/app/landing/layout.tsx`)

**Social avatar** (profile picture for all channels):
- The gradient-background sparkle icon, 400×400 px, PNG
- No text — icon only at this size

**Social banner** (Twitter/X and YouTube header):
- 1500×500 px (Twitter/X)
- Background: `#0F0A1A` with gradient glow
- Content: centered wordmark + tagline + a row of platform icons (TikTok, Reels, Shorts) with checkmarks

---

## 6. Voice & Tone

### Brand personality
- **Confident, not boastful**: "AI finds your best moments" — not "The world's most advanced AI editor"
- **Exciting, not hypey**: "Viral-ready in seconds" — not "EXPLOSIVE viral growth GUARANTEED"
- **Direct, not formal**: speak to creators like a peer, not a tech company
- **Honest**: no invented metrics, no fabricated social proof, no "millions of users" unless true

### Copy principles
1. **Lead with the outcome**: start with what the user gets (the highlight, the viral clip), not the technology
2. **Verb-first headlines**: "Turn raw footage into viral clips" > "Advanced AI video editing"
3. **Short sentences in marketing**: maximum 15 words per sentence in hero copy
4. **Numbers when you have them**: "5 free exports/month" > "generous free tier"
5. **Never fabricate** reviews, ratings, download counts, or social proof — leave placeholders rather than invent

### Voice samples
| Situation | Do say | Don't say |
|---|---|---|
| Hero CTA | "Get the App — It's Free" | "Start Your Journey Today" |
| Benefit callout | "AI finds the goal, the laugh, the drop" | "Powerful intelligent scene recognition technology" |
| Pricing note | "5 exports free, forever" | "Freemium model with generous limits" |
| Error message | "Something went wrong. Try again." | "An unexpected error has occurred. Please contact support." |

---

## 7. Platform-Specific Assets Checklist

| Asset | Size | Status | Owner action |
|---|---|---|---|
| App Store icon | 1024×1024 PNG, no alpha | ⬜ Needed | Rasterize from brand spec |
| App preview video thumbnail | 1080×1920 (portrait) | ⬜ Needed | Screenshot from device |
| App Store screenshots (6.9-inch) | 1320×2868 | ⬜ Needed | Capture from simulator |
| OG image | 1200×630 | ⬜ Spec in this doc | Rasterize + upload to `/public` |
| Social avatar | 400×400 PNG | ⬜ Needed | Rasterize icon |
| Twitter/X banner | 1500×500 PNG | ⬜ Needed | Rasterize banner spec |
| Favicon | 32×32 + 16×16 PNG | ⬜ Needed | Rasterize icon |
| Apple Touch Icon | 180×180 PNG | ⬜ Needed | Rasterize icon |

---

*Last updated: 2026-06-25 (Run 10, E2). Design tokens verified against `web/src/app/globals.css` and iOS `Sources/Utilities/Theme.swift`.*
