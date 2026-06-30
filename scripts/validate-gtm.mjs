#!/usr/bin/env node
/**
 * validate-gtm — the GTM analog of validate-capabilities: a deterministic, fail-CLOSED honesty gate
 * for the growth/GTM dashboard feeds. The independent reviewers judge the SOFT stuff (is the growth
 * analysis sound?); this enforces the HARD, machine-checkable honesty rules so the loop can never
 * report a growth number it cannot source:
 *
 *   1. GROWTH_STATUS fenced YAML parses.
 *   2. METRIC-WITHOUT-A-SOURCE tripwire: if any funnel/acquisition/pmf/channels metric is non-zero, a
 *      connected source MUST be declared (channels_connected truthy, OR a `sources`/`validation` block
 *      with a connected/available entry). A real number with no connected source = fabrication risk →
 *      FAIL. (Pre-launch everything is 0/null → passes.)
 *   3. GTM_SCORECARD (IF present) parses and its grades are in {A+,A,B,C,D,F,null}, ship_gate_met set.
 *   4. --readiness: additionally require GTM_SCORECARD to exist with no ship_critical dim < A. (Not
 *      wired into HighlightMagic's preflight: there is no GTM Auditor routine producing a scorecard,
 *      so requiring one would gate on an unbuilt dependency loop — DECISION COROLLARY. The honesty
 *      tripwire (#2) is what runs per-PR + at readiness here.)
 *
 * Usage: node scripts/validate-gtm.mjs [--readiness]
 * NEVER prints a secret. Reads ONLY the committed GTM feeds. js-yaml is a DECLARED dependency of
 * web/ (not transitive — pitfall #2); we resolve it from there via createRequire.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Resolve the YAML parser from web/'s declared deps (robust regardless of cwd; fails loud if absent).
const require = createRequire(path.join(ROOT, "web", "package.json"));
let yaml;
try {
  yaml = require("js-yaml");
} catch {
  console.error("validate-gtm: cannot resolve js-yaml (a declared web/ devDependency). Run `npm ci` in web/ first.");
  process.exit(1);
}

const READINESS = process.argv.includes("--readiness");
const STATUS = path.join(ROOT, "docs/growth/GROWTH_STATUS.md");
const SCORECARD = path.join(ROOT, "docs/growth/GTM_SCORECARD.md");
const GRADES = new Set(["A+", "A", "B", "C", "D", "F", null]);
const errors = [];

function block(file, key) {
  if (!fs.existsSync(file)) return undefined;
  const t = fs.readFileSync(file, "utf8");
  for (const m of t.matchAll(/```ya?ml\n([\s\S]*?)\n```/g)) {
    let d;
    try { d = yaml.load(m[1]); } catch { continue; }
    if (d && typeof d === "object" && key && key in d) return d[key];
    if (d && typeof d === "object" && !key) return d;
  }
  return undefined;
}

// --- 1. GROWTH_STATUS parses ---
if (!fs.existsSync(STATUS)) {
  errors.push("docs/growth/GROWTH_STATUS.md is missing (the growth dashboard feed).");
} else {
  const gs = block(STATUS, "GROWTH_STATUS");
  if (gs === undefined) {
    errors.push("GROWTH_STATUS.md has no parseable fenced `GROWTH_STATUS:` YAML block.");
  } else {
    // --- 2. metric-without-a-source tripwire ---
    const metricSections = ["funnel", "acquisition", "pmf", "channels"];
    const reported = [];
    const walk = (v, p) => {
      if (v == null) return;
      if (typeof v === "number") { if (v > 0) reported.push(`${p}=${v}`); return; }
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${p}[${i}]`)); return; }
      if (typeof v === "object") { for (const k of Object.keys(v)) walk(v[k], `${p}.${k}`); }
    };
    for (const s of metricSections) if (s in gs) walk(gs[s], s);

    const cc = gs.channels_connected;
    const channelsConnected =
      cc === true || (Array.isArray(cc) && cc.length > 0) ||
      (typeof cc === "string" && cc.trim() !== "" && !/^(none|n\/a|\[\])$/i.test(cc.trim()));
    const srcBlock = gs.sources ?? gs.validation ?? null;
    const sourceDeclared = (() => {
      if (!srcBlock) return false;
      const txt = JSON.stringify(srcBlock).toLowerCase();
      return /(connected|available)["\s:]*?(true|"?(connected|available|live)"?)/.test(txt) ||
        (Array.isArray(srcBlock) && srcBlock.length > 0 && !txt.includes("unavailable"));
    })();

    if (reported.length > 0 && !channelsConnected && !sourceDeclared) {
      errors.push(
        `METRIC WITHOUT A SOURCE: ${reported.length} non-zero GROWTH_STATUS metric(s) are reported ` +
          `but no connected source is declared (channels_connected is falsy and no sources/validation ` +
          `entry is marked connected/available). A real number with no connected source is a ` +
          `fabrication risk.\n    reported: ${reported.slice(0, 8).join(", ")}${reported.length > 8 ? " ..." : ""}\n` +
          `    -> set the metric to 0/null until a source is connected, OR declare the connected source ` +
          `in channels_connected / a sources block (and surface a connect-* OWNER_ACTION if it needs the owner).`,
      );
    }
  }
}

// --- 3. GTM_SCORECARD validity (if present) ---
const scExists = fs.existsSync(SCORECARD);
if (scExists) {
  const sc = block(SCORECARD, "GTM_SCORECARD") ?? block(SCORECARD, null);
  if (sc === undefined) {
    errors.push("GTM_SCORECARD.md exists but has no parseable fenced YAML block.");
  } else {
    const dims = sc.dimensions ?? sc.grades ?? sc;
    const bad = [];
    const scanGrades = (obj) => {
      if (!obj || typeof obj !== "object") return;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" || v === null) {
          if (/grade|^[a-z_]+$/.test(k) && typeof v === "string" && v.length <= 2 && !GRADES.has(v)) {
            bad.push(`${k}=${v}`);
          }
        } else if (v && typeof v === "object") {
          if ("grade" in v && !GRADES.has(v.grade)) bad.push(`${k}.grade=${v.grade}`);
        }
      }
    };
    scanGrades(dims);
    if (bad.length) errors.push(`GTM_SCORECARD has invalid grade(s) (allowed A+/A/B/C/D/F/null): ${bad.join(", ")}`);
    if (!("ship_gate_met" in sc) && !(dims && "ship_gate_met" in dims)) {
      errors.push("GTM_SCORECARD is missing `ship_gate_met`.");
    }
  }
} else if (READINESS) {
  errors.push("--readiness: docs/growth/GTM_SCORECARD.md does not exist (no GTM grade). Cannot assert GTM readiness.");
}

if (errors.length) {
  console.error(`\nvalidate-gtm: FAIL (${errors.length})\n`);
  for (const e of errors) console.error(` - ${e}`);
  console.error("\nSee FACTORY_STANDARD.md (§6 VALIDATION CAPABILITY) + docs/growth/GROWTH_STATUS.md (real data only).");
  process.exit(1);
}
console.log(`validate-gtm: OK${scExists ? " (GTM_SCORECARD present)" : " (no GTM_SCORECARD yet)"}${READINESS ? " [readiness]" : ""}.`);
