/**
 * Generate the app-icon PNG set from the brand-kit spec (docs/brand-kit.md §4: a white sparkle
 * glyph centered in a rounded-square container filled with the signature 135° gradient
 * #7C3AED → #EC4899, no drop shadow).
 *
 * The web manifest (web/public/manifest.json) and the root layout's apple-touch-icon link reference
 * /icons/icon-192.png, /icons/icon-512.png, /icons/icon-maskable.png — none of which existed, so
 * every reference 404'd (broken PWA install + browser tab). This script renders them (and the
 * Next favicon at web/src/app/icon.png) deterministically from one SVG so the brand mark stays
 * consistent and re-generable. No network, no external assets.
 *
 * Run: `node scripts/generate-icons.mjs` (from repo root). Outputs are committed to the repo.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// sharp is a web/ dependency (not installed at repo root); resolve it from there like the sibling
// validate-*.mjs scripts resolve js-yaml.
const require = createRequire(join(ROOT, "web", "package.json"));
const sharp = require("sharp");
const ACCENT = "#7C3AED";
const PINK = "#EC4899";

// 4-point sparkle on a 24×24 viewBox, matching the OG card mark.
const SPARKLE = "M12 0 L14 8.5 L22.5 10.5 L14 13 L12 22 L10 13 L1.5 10.5 L10 8.5 Z";

/**
 * Build the icon SVG.
 * @param {number} size        canvas edge in px
 * @param {number} radiusRatio corner radius as a fraction of size (0 = square, for maskable full-bleed)
 * @param {number} glyphRatio  sparkle edge as a fraction of size (smaller = more safe-zone padding)
 */
function iconSvg(size, radiusRatio, glyphRatio) {
  const r = Math.round(size * radiusRatio);
  const glyph = size * glyphRatio;
  const offset = (size - glyph) / 2;
  const scale = glyph / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${PINK}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#g)"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <path d="${SPARKLE}" fill="#FFFFFF"/>
  </g>
</svg>`;
}

async function png(svg, size, outPath) {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  console.log(`wrote ${outPath} (${buf.length} bytes)`);
}

// Standard icons + favicon: rounded square (radius ~22%), sparkle at ~56% (leaves breathing room).
// Maskable: FULL-BLEED gradient (no rounded corners — the platform applies its own mask) with the
// sparkle pulled in to ~46% so it stays inside the maskable safe zone (inner ~80%).
const targets = [
  { size: 192, radius: 0.22, glyph: 0.56, out: "web/public/icons/icon-192.png" },
  { size: 512, radius: 0.22, glyph: 0.56, out: "web/public/icons/icon-512.png" },
  { size: 512, radius: 0.0, glyph: 0.46, out: "web/public/icons/icon-maskable.png" },
  { size: 512, radius: 0.22, glyph: 0.56, out: "web/src/app/icon.png" }, // Next favicon (auto-wired)
];

for (const t of targets) {
  await png(iconSvg(t.size, t.radius, t.glyph), t.size, resolve(ROOT, t.out));
}
console.log("done");
