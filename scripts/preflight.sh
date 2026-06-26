#!/usr/bin/env bash
# scripts/preflight.sh — MECHANICAL READINESS BACKSTOP (ROADMAP "READINESS AUDIT GATE", gate 1).
#
# Run this BEFORE opening the "ready for submission" issue. It is the un-gameable gate:
# "code exists" must NOT pass as "it works", and the loop CANNOT declare ready while any
# Definition-of-Done box is open. Exit 0 ONLY if the project is mechanically ready; any
# failure exits non-zero. Passing this is necessary but NOT sufficient — the adversarial
# readiness audit (gate 2, ≥3 independent auditors) must ALSO pass before declaring ready.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
fail() { echo "PREFLIGHT FAIL: $*" >&2; exit 1; }
ok()   { echo "  ok: $*"; }

echo "== 1. Definition-of-Done checkboxes ALL ticked (fail fast if any open) =="
if grep -nE '^- \[ \] DOD[0-9]' ROADMAP.md; then
  fail "one or more Definition-of-Done boxes (above) are unchecked — NOT ready."
fi
grep -qE '^- \[x\] DOD1' ROADMAP.md || fail "DOD checkboxes missing/renamed in ROADMAP.md (expected DOD1..)"
ok "all DOD# boxes are [x]"

echo "== 2. Required artifacts exist on disk =="
REQUIRED=(
  ROADMAP.md README.md docs/BUSINESS_CASE.md REMAINING_STEPS.md docs/MODEL_COSTS.md
  web/src/lib/entitlement.ts web/src/app/api/score/route.ts
  Package.swift Sources Tests/HighlightMagicTests
)
for f in "${REQUIRED[@]}"; do [ -e "$f" ] || fail "missing required artifact: $f"; ok "$f"; done

echo "== 3. Critical revenue/functionality paths WIRED (not stubbed) =="
# Billing/checkout call must actually exist (StoreKit purchase), not just a paywall view.
grep -rqE 'Product\.products|\.purchase\(|Transaction\.(currentEntitlements|updates)|AppStore\.sync' Sources/ \
  || fail "no StoreKit purchase/entitlement call found in Sources/ — billing path is not wired."
ok "StoreKit purchase/entitlement call present"
# Server-side entitlement gate must be enforced before the paid proxy call.
grep -q 'checkExportAllowed' web/src/app/api/score/route.ts \
  || fail "paid proxy /api/score does not enforce the server-side entitlement gate."
ok "server-side entitlement gate enforced before the paid call"
# Core product flow must be present: detection entrypoint + export path.
grep -rqE 'func detectHighlights' Sources/ \
  || fail "core detection path (HighlightDetectionService.detectHighlights) missing."
ok "core detection path present"
grep -rqE 'func exportClip|actor ExportService|class ExportService' Sources/ \
  || fail "core export path (ExportService.exportClip) missing."
ok "core highlight/export path present"
# No stub/placeholder markers on critical paths (intentional secure-default TODO(P0) excepted).
if grep -rniE 'TODO|FIXME|not implemented|placeholder|\bstub\b' \
     Sources/Services/ClipGenerationService.swift \
     web/src/app/api/score/route.ts web/src/lib/entitlement.ts 2>/dev/null \
     | grep -viE 'TODO\(P0\)|secure default'; then
  fail "stub/TODO/placeholder marker on a critical path — 'code exists' is not 'it works'."
fi
ok "no stub markers on critical paths"
# Business-case machine-readable summary block must exist AND parse with a real YAML parser
# (a block that doesn't parse must never ship — the dashboard degrades to "unparseable -> link").
BCS="$(awk '/^```yaml/{f=1;next} /^```/{if(f)exit} f' docs/BUSINESS_CASE.md)"
[ -n "$BCS" ] || fail "BUSINESS_CASE_SUMMARY \`\`\`yaml block missing from docs/BUSINESS_CASE.md."
BCS_TMP="$(mktemp)"; printf '%s\n' "$BCS" > "$BCS_TMP"
if python3 -c 'import yaml' >/dev/null 2>&1; then
  python3 - "$BCS_TMP" <<'PY' || { rm -f "$BCS_TMP"; fail "BUSINESS_CASE_SUMMARY does not parse as YAML, or arr_year1.base is missing."; }
import sys, yaml
d = yaml.safe_load(open(sys.argv[1]))
assert isinstance(d, dict), "summary block is not a YAML mapping"
assert d.get("arr_year1", {}).get("base") is not None, "arr_year1.base missing"
PY
elif [ -f web/node_modules/js-yaml/package.json ]; then
  node -e 'const y=require("./web/node_modules/js-yaml"),fs=require("fs");const d=y.load(fs.readFileSync(process.argv[1],"utf8"));if(!d||typeof d!=="object"||d.arr_year1==null||d.arr_year1.base==null)process.exit(1);' "$BCS_TMP" \
    || { rm -f "$BCS_TMP"; fail "BUSINESS_CASE_SUMMARY does not parse as YAML, or arr_year1.base is missing."; }
else
  rm -f "$BCS_TMP"; fail "no YAML parser available (need python3+PyYAML or web js-yaml) to verify the summary block."
fi
rm -f "$BCS_TMP"
ok "BUSINESS_CASE_SUMMARY parses (real YAML); arr_year1.base present"

echo "== 4. Re-run the full web gate (the required CI check) IN THIS RUN =="
( cd web && npm ci && npm run build && npm test ) || fail "web gate (npm ci && build && test) failed."
ok "web build + tests green"

echo "== 5. iOS required check green on latest main (loop can't run xcodebuild on Linux) =="
if command -v gh >/dev/null 2>&1; then
  RID="$(gh run list --workflow CI --branch main --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
  if [ -n "${RID:-}" ]; then
    IOS="$(gh run view "$RID" --json jobs --jq '.jobs[]|select(.name=="ios").conclusion' 2>/dev/null || true)"
    [ "$IOS" = "success" ] || fail "ios CI check is not green on latest main (got: ${IOS:-unknown})."
    ok "ios CI check green on main"
  else
    echo "  warn: could not query CI run; the REQUIRED ios check still gates the merge."
  fi
else
  echo "  warn: gh not available; the REQUIRED ios check still gates the merge."
fi

echo
echo "PREFLIGHT PASS — mechanical gate clear."
echo "NOT YET READY: gate 2 (>=3 independent adversarial auditors) must also pass before opening the ready issue."
exit 0
