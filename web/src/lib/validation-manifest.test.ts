import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { VALIDATION_MANIFEST, REGISTERED_ENV_VARS } from "./validation-manifest";

/**
 * VALIDATION-COMPLETENESS GATE (runs in the REQUIRED `web` check).
 *
 * Asserts that EVERY environment variable the backend reads is registered in validation-manifest.ts
 * with a validation mode. This is the mechanism that stops the autonomous loop from silently shipping
 * a capability it cannot validate: introduce a NEW external service/secret (a new `process.env.X`)
 * without registering it, and this test FAILS → the `web` check is red → the PR cannot auto-merge.
 *
 * To unblock: add the new var to VALIDATION_MANIFEST with the right mode, and ensure its validation
 * path exists (a keyless contract/journey test for "mock"; an eval + an OWNER_ACTION for the key for
 * "live-eval"). That is the surface-and-block the owner asked for.
 */

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_READ = /process\.env\.([A-Z0-9_]+)/g;

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__screenshots__") continue;
      collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function envVarsReadInSource(): Map<string, string[]> {
  const usage = new Map<string, string[]>();
  for (const file of collectSourceFiles(SRC_ROOT)) {
    // Don't count the manifest or this gate itself — they reference env NAMES as data, not reads.
    if (file.endsWith("validation-manifest.ts") || file.endsWith("validation-manifest.test.ts")) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = ENV_READ.exec(text)) !== null) {
      const name = m[1];
      const rel = path.relative(SRC_ROOT, file);
      const files = usage.get(name) ?? [];
      if (!files.includes(rel)) files.push(rel);
      usage.set(name, files);
    }
  }
  return usage;
}

describe("validation-manifest completeness gate", () => {
  it("every external service/secret read in the code is registered (new ones BLOCK merge)", () => {
    const used = envVarsReadInSource();
    const unregistered = [...used.keys()].filter((name) => !REGISTERED_ENV_VARS.has(name));

    if (unregistered.length > 0) {
      const detail = unregistered
        .map((n) => `  - ${n}  (used in: ${used.get(n)!.join(", ")})`)
        .join("\n");
      throw new Error(
        "Unregistered environment variable(s) read in web/src but NOT in validation-manifest.ts:\n" +
          detail +
          "\n\nThis BLOCKS merge on purpose: the loop must not ship a capability it cannot validate.\n" +
          "Fix: add each var to VALIDATION_MANIFEST with a validation mode, and ensure its validation\n" +
          "path exists — a keyless contract/journey test for `mock`; an eval + an OWNER_ACTION for the\n" +
          "key (validation-eval-keys) for `live-eval`; `owner-only`/`build-config`/`internal` as fitting.",
      );
    }
    expect(unregistered).toEqual([]);
  });

  it("every live-eval entry documents how its real round-trip is validated", () => {
    const undocumented = VALIDATION_MANIFEST.filter(
      (e) => e.validation === "live-eval" && !e.evalNote,
    ).map((e) => e.env);
    expect(undocumented, "live-eval services must name their eval + key source in evalNote").toEqual([]);
  });

  it("has no duplicate registrations", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const e of VALIDATION_MANIFEST) {
      if (seen.has(e.env)) dupes.push(e.env);
      seen.add(e.env);
    }
    expect(dupes).toEqual([]);
  });
});
