# Journey Screenshots — FACTORY_STANDARD §6 "See What the User Sees"

These full-page screenshots are committed per FACTORY_STANDARD.md §6 so the deep-audit + readiness gate can visually review the real rendered UI — a green DOM assertion alone does not rule out a blank, broken, or off-brand surface.

The journey suite runs at **two viewports** so the review covers both form factors:
- **Desktop Chrome** (`chromium` project) → captures land in this directory (root).
- **Pixel 5** (`mobile-chrome` project, 393×727) → captures land in [`mobile-chrome/`](./mobile-chrome/). HighlightMagic is a vertical-video app used almost entirely on phones, so the phone form factor is the one that matters most for design review.

Both projects assert the SAME outcomes; only the viewport (and therefore the committed capture) differs.

To regenerate: from the `web/` directory run `npm run test:e2e`.

## Screenshot Index (same filenames under each project's directory)

| File | Route / Flow | Asserted State |
|---|---|---|
| `01-app-main-drop-footage.png` | `/` | Editor Upload hero — "Drop your footage." heading visible; error boundary absent |
| `02-landing-hero.png` | `/landing` | Marketing hero `<h1>` + email input visible; error boundary absent |
| `03-landing-waitlist-success.png` | `/landing` (waitlist submit) | Success state "You're on the list!" rendered after real form submission; error boundary absent |
| `04-privacy.png` | `/privacy` | Privacy page heading visible; not 404/error boundary |
| `05-terms.png` | `/terms` | Terms page heading visible; not 404/error boundary |
| `06-support.png` | `/support` | Support/FAQ heading visible; not 404/error boundary |
| `07-offline.png` | `/offline` | PWA offline fallback heading visible; not 404/error boundary |
