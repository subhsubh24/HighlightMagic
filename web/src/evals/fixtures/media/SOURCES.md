# Eval media fixtures — provenance & sourcing policy

Real-pixel media the evals run through the actual pipeline (frame scoring now; export/extraction as
those rungs land — ROADMAP G3). **Every file here MUST be redistributable and its provenance recorded
below** (committing a file to the repo = redistributing it). Grow this set over time (more files, more
content types) — that IS the G3 mandate.

## Provenance (every committed file)

| File | Source | License | Notes |
|---|---|---|---|
| `gen_testpattern_540x960.jpg` | Programmatically generated (`ffmpeg -f lavfi -i testsrc`) | None — generated, public domain | Real JPEG pixels; license-free bootstrap for the scoring round-trip. |
| `gen_gradient_540x960.jpg` | Programmatically generated (`ffmpeg -f lavfi -i gradients`) | None — generated, public domain | " |
| `gen_mandelbrot_540x960.jpg` | Programmatically generated (`ffmpeg -f lavfi -i mandelbrot`) | None — generated, public domain | " |
| `gen_vertical_3s_1080x1920.mp4` | Programmatically generated (`ffmpeg -f lavfi -i testsrc`, h264) | None — generated, public domain | Real vertical MP4 for the future extraction/export rungs. |

These generated clips validate the pipeline **plumbing** (real pixels/real files actually flow through
and produce valid output). **Realistic CC0/public-domain footage is layered in next** for the
QUALITY-judgment rungs (a test pattern can't validate "did it pick the right highlight").

## Where to source realistic CC0 / public-domain media (vetted)

Only commit media whose license **permits redistribution**; **CC0 / public-domain preferred**; cite
license + source URL per file in the table above. Even with a clean file license, **avoid identifiable
people, trademarks, and copyrighted music** in the clip — those are separate rights.

**Cleanest (unambiguous CC0 / public domain):**
- **Wikimedia Commons** — filter to PD / CC0 (license is per-file; PD/CC0/CC-BY/CC-BY-SA all appear).
- **Openverse** (openverse.org) — filter to CC0 / public domain specifically.
- **US gov / NASA / NOAA** — public domain by law (nature, space, earth).
- **Museum open access** — Met, Smithsonian, Rijksmuseum, Art Institute (large CC0 image sets).

**Realistic vertical clips (permissive, NOT strictly CC0 — fine for test fixtures, note per file):**
- **Pexels, Pixabay, Coverr, Mixkit** — free, commercial-OK, mostly no attribution; custom licenses
  allow use but restrict "redistribute as-is as stock" (acceptable for repo test fixtures).

**Known test videos (CC-BY — keep attribution):**
- **Blender open movies** (Big Buck Bunny, Sintel, Tears of Steel).

**Zero-license-risk bootstrap:** programmatically generated clips (ffmpeg `testsrc`/`gradients`/etc.) —
what the `gen_*` files above are.
