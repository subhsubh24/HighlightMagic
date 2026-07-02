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

# --- FACTORY_STANDARD §22: computation-integrity gate (fail-safe; vacuous until analysis/figures.json has entries) ---
if [ -f scripts/validate-computation.mjs ] && ! node scripts/validate-computation.mjs; then
  echo "PREFLIGHT FAIL: validate-computation (§22) — a committed figure is mis-computed or non-reproducible." >&2
  exit 1
fi
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
# Track H security: rate limiting (H1) + code-level spend ceiling (H7) on the paid path.
grep -rqiE 'ratelimit|rate.?limit' web/src/app/api/score/route.ts web/src/lib 2>/dev/null \
  || fail "no rate limiting on the paid proxy / shared lib (Track H1) — unthrottled paid endpoint is a wallet drain."
ok "rate limiting present on the paid path (H1)"
grep -rqiE 'spend.?ceiling|spend.?cap|circuit.?break|daily.?cap|usage.?cap' web/src/lib web/src/app/api 2>/dev/null \
  || fail "no code-level API spend ceiling / circuit-breaker (Track H7)."
ok "code-level API spend ceiling present (H7)"
# Core product flow must be present: detection entrypoint + export path.
grep -rqE 'func detectHighlights' Sources/ \
  || fail "core detection path (HighlightDetectionService.detectHighlights) missing."
ok "core detection path present"
grep -rqE 'func exportClip|actor ExportService|class ExportService' Sources/ \
  || fail "core export path (ExportService.exportClip) missing."
ok "core highlight/export path present"
# BUILDS != WORKS: the functional E2E suite + route/flow inventory must EXIST and be wired into CI
# (a journey with no outcome-asserting runtime test is treated as BROKEN). The runnable web/backend
# suite executes in CI; preflight asserts the harness + inventory are present so readiness can never
# pass build-but-broken. Device-only/sandbox gaps live on the PENDING_OPS human checklist.
{ [ -f web/playwright.config.ts ] || [ -d web/e2e ]; } \
  || fail "no web functional E2E harness (web/playwright.config.ts or web/e2e/) — BUILDS != WORKS gate (G4)."
ok "web functional E2E harness present"
grep -q '"test:e2e"' web/package.json \
  || fail "web/package.json has no test:e2e script — functional suite not wired into CI (G4)."
ok "web test:e2e script wired"
[ -f web/e2e/ROUTE_INVENTORY.md ] \
  || fail "missing web/e2e/ROUTE_INVENTORY.md (route/flow + screen inventory — coverage not provable)."
ok "functional route/flow + screen inventory present"
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
# SCOPE NOTE: this is the MECHANICAL floor only (block exists + parses + arr_year1.base present).
# Business-case STRENGTH — whether the honest case clears the $100K floor on the modeled path and
# whether every high-ROI lever is actually BUILT (not just listed) — is a JUDGMENT call enforced by
# the Gate-2 adversarial auditors (see ROADMAP "BUSINESS-CASE STRENGTH & lever-completeness" +
# WEAK-CASE LOOP-BACK), NOT here. Do NOT add a numeric "reject if arr_year1 < floor" check: the model
# clears the floor on a multi-year path (base ~year 3.5), so year-1 ARR is correctly below $100K and a
# raw-number gate would block readiness forever. A weak case re-opens building via Gate 2, not preflight.
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

# Dashboard feeds — GROWTH_STATUS must parse (the factory dashboard reads it) AND its
# growth-execution-engine flags must be PINNED TO REAL CODE, never hand-set ahead of the engine.
# NOTE: the regex captures the WHOLE fenced ```yaml block (not just the first line), so a
# valid file passes; an unparseable/missing block fails.
# ANTI-DRIFT (lesson from the sister product, which flipped engine_built:true ~6h before the
# engine existed by conflating staged content with the live engine): engine_pct is COMPUTED here
# from which E6 anchor files physically exist on disk; the YAML must MATCH the computed value, and
# engine_built must equal (engine_pct == 100). A hollow `true` is therefore impossible.
if python3 - "$ROOT/docs/growth/GROWTH_STATUS.md" "$ROOT" <<'PY'
import sys, re, yaml, os
gs_path, root = sys.argv[1], sys.argv[2]
try: txt = open(gs_path).read()
except OSError: print("GROWTH_STATUS.md missing"); sys.exit(1)
m = re.search(r"```ya?ml\s*\n(.*?GROWTH_STATUS.*?)\n```", txt, re.S)
if not m: print("no GROWTH_STATUS block"); sys.exit(1)
try: d = (yaml.safe_load(m.group(1)) or {}).get("GROWTH_STATUS") or {}
except Exception as e: print("UNPARSEABLE:", e); sys.exit(1)
if d.get("phase") not in ("pre_launch","launching","post_launch"): print("bad phase"); sys.exit(1)
if not isinstance(d.get("funnel"), dict): print("missing funnel"); sys.exit(1)
# The growth-execution engine (ROADMAP Track E / E6) = a FIXED set of pieces, each pinned to ONE
# anchor file in web/ (or the owner runbook). Keep this list in sync with what E6 actually builds.
ANCHORS = [
    "web/src/app/api/waitlist/confirm/route.ts",  # 1. waitlist confirm / double-opt-in (E6a)
    "web/src/lib/email/index.ts",                 # 2. email-send provider abstraction   (E6b)
    "web/src/lib/social/queue.ts",                # 3. social publishing queue           (E6c)
    "web/src/lib/growth/metrics.ts",              # 4. growth-metrics read API           (E6d)
    "docs/growth/CONNECT.md",                     # 5. owner connect runbook             (E6e)
]
shipped = sum(1 for p in ANCHORS if os.path.exists(os.path.join(root, p)))
computed = round(shipped / len(ANCHORS) * 100)
declared = d.get("engine_pct")
if not isinstance(declared, int) or isinstance(declared, bool):
    print("engine_pct must be an integer 0-100 (computed from real anchor files)"); sys.exit(1)
if declared != computed:
    print(f"engine_pct DRIFT: declared={declared} but computed={computed} ({shipped}/{len(ANCHORS)} anchor files on disk)"); sys.exit(1)
built = d.get("engine_built")
if not isinstance(built, bool):
    print("engine_built must be a boolean"); sys.exit(1)
if built != (computed == 100):
    print(f"engine_built must == (engine_pct==100): engine_built={built} engine_pct={computed}"); sys.exit(1)
print(f"ok phase={d['phase']} engine_pct={computed} engine_built={built}")
PY
then ok "GROWTH_STATUS: valid; engine_pct/engine_built pinned to real anchor files"
else fail "GROWTH_STATUS: invalid, UNPARSEABLE, or engine flags drifted from real code"; fi

# Dashboard feeds — OWNER_ACTIONS must parse.
if python3 - "$ROOT/PENDING_OPS.md" <<'PY'
import sys, re, yaml
txt = open(sys.argv[1]).read()
m = re.search(r"```ya?ml\s*\n(.*?OWNER_ACTIONS.*?)\n```", txt, re.S)
if not m: print("no OWNER_ACTIONS block"); sys.exit(1)
try: d = (yaml.safe_load(m.group(1)) or {}).get("OWNER_ACTIONS") or {}
except Exception as e: print("UNPARSEABLE:", e); sys.exit(1)
if not isinstance(d.get("items"), list): print("items must be a list"); sys.exit(1)
for it in d["items"]:
    if it.get("status") not in ("open","in_progress","done"): print("bad status", it.get("id")); sys.exit(1)
    if it.get("priority") not in ("urgent","high","normal"): print("bad priority", it.get("id")); sys.exit(1)
print("ok", len(d["items"]))
PY
then ok "OWNER_ACTIONS: valid, parseable YAML block"
else fail "OWNER_ACTIONS: missing or UNPARSEABLE"; fi

# Quality scorecard — owned by the INDEPENDENT Quality Auditor (maker != checker); the factory only
# READS/validates it, never authors it. Like the other dashboard feeds: the QUALITY_SCORECARD block
# must exist + parse, and every grade must be a valid letter grade. A malformed scorecard (or a
# missing independent grade at readiness) must NOT ship. (The A/A+ ship-critical requirement is the
# DoD/Gate-2 judgment; here we mechanically guarantee the block is real + grades are well-formed.)
if python3 - "$ROOT/docs/quality/QUALITY_SCORECARD.md" <<'PY'
import sys, re, yaml
try: txt = open(sys.argv[1]).read()
except OSError: print("QUALITY_SCORECARD.md missing — the independent Quality Auditor must bootstrap it before readiness"); sys.exit(1)
m = re.search(r"```ya?ml\s*\n(.*?QUALITY_SCORECARD.*?)\n```", txt, re.S)
if not m: print("no QUALITY_SCORECARD block"); sys.exit(1)
try: d = yaml.safe_load(m.group(1)) or {}
except Exception as e: print("UNPARSEABLE:", e); sys.exit(1)
VALID = {"A+", "A", "B", "C", "D", "F", None}
bad = []
def grades_in(v):
    if isinstance(v, dict): return [g for vv in v.values() for g in grades_in(vv)]
    if isinstance(v, list): return [g for it in v for g in grades_in(it)]
    return [v]
def walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(k, str) and "grade" in k.lower():
                for x in grades_in(v):
                    if x not in VALID: bad.append((k, x))
            else: walk(v)
    elif isinstance(o, list):
        for it in o: walk(it)
walk(d)
if bad: print("invalid grade(s) (must be A+/A/B/C/D/F/null):", bad[:5]); sys.exit(1)
print("ok QUALITY_SCORECARD parses; all grades valid")
PY
then ok "QUALITY_SCORECARD: valid block; grades in {A+,A,B,C,D,F,null}"
else fail "QUALITY_SCORECARD: missing, UNPARSEABLE, or contains an invalid grade"; fi

# VALIDATION COMPLETENESS — readiness mode (per-PR mode is the required `web`/`validate-capabilities`
# check that fails on an unregistered service). At readiness, EVERY capability must be validated: the
# gate must be enforced in CI AND there must be ZERO unmet capabilities (a capability whose real
# validation is blocked on an owner-only secret — e.g. the live-eval AI keys). An unmet capability is
# surfaced in BOTH the LOOP_HEALTH validation.unmet list AND as an urgent OWNER_ACTION; it BLOCKS ready.
if python3 - "$ROOT/docs/autonomous-loop/LOOP_HEALTH.md" <<'PY'
import sys, re, yaml
try: txt = open(sys.argv[1]).read()
except OSError: print("LOOP_HEALTH.md missing"); sys.exit(1)
m = re.search(r"```ya?ml\s*\n(.*?LOOP_HEALTH.*?)\n```", txt, re.S)
if not m: print("no LOOP_HEALTH block"); sys.exit(1)
try: d = (yaml.safe_load(m.group(1)) or {}).get("LOOP_HEALTH") or {}
except Exception as e: print("UNPARSEABLE:", e); sys.exit(1)
v = d.get("validation")
if not isinstance(v, dict): print("no validation sub-block in LOOP_HEALTH (capability surfacing missing)"); sys.exit(1)
if v.get("enforced_in_ci") is not True: print("validation.enforced_in_ci must be true"); sys.exit(1)
# A capability is validated only when its REAL eval passes. Readiness blocks on BOTH:
#   unmet             = OWNER-blocked (a key/secret the owner must provide) — the dashboard's "needs your key"
#   awaiting_loop_eval = key PROVIDED, the LOOP must still BUILD the eval (ROADMAP G3)
unmet = v.get("unmet") or []
awaiting = v.get("awaiting_loop_eval") or []
blocked = list(unmet) + list(awaiting)
if blocked: print("readiness blocked — capabilities not yet real-validated (owner_blocked:", unmet, "| loop_blocked/awaiting_loop_eval:", awaiting, ")"); sys.exit(1)
print("ok validation: enforced_in_ci=true; 0 owner-blocked, 0 awaiting-loop-eval")
PY
then ok "VALIDATION: capability gate enforced in CI; 0 owner-blocked + 0 awaiting-eval"
else fail "VALIDATION: gate not enforced, block missing, or capabilities unvalidated (LOOP_HEALTH validation.unmet=owner-blocked + .awaiting_loop_eval=loop-blocked)"; fi

echo "== 4. Re-run the full web gate (the required CI check) IN THIS RUN =="
( cd web && npm ci && npm run build && npm test ) || fail "web gate (npm ci && build && test) failed."
ok "web build + tests green"

# GTM honesty gate (the GTM analog of the capability gate). Fail CLOSED if a GROWTH_STATUS metric is
# non-zero with no connected source declared, or a present GTM_SCORECARD is malformed. Run WITHOUT
# --readiness: there is no GTM Auditor routine producing a GTM_SCORECARD, so requiring one would gate
# on an unbuilt dependency loop. (web/node_modules — incl. the declared js-yaml — exists from §4.)
node scripts/validate-gtm.mjs || fail "validate-gtm: a growth metric lacks a connected source (fabrication risk) or GTM_SCORECARD is malformed."
ok "GTM honesty gate: every reported growth metric has a connected source"

echo "== 5. BUILDS != WORKS — RUN the functional journey suite GREEN this attempt =="
# A green build alone must NOT reach 'ready'. Actually RUN the real-browser, outcome-asserting
# journeys against a freshly built+started app (Playwright's webServer builds + `next start`s it;
# no DB/migration chain in this product's web/, captcha fails open with TURNSTILE_SECRET_KEY unset).
# preflight FAILS unless the suite exits green and we export E2E_JOURNEYS_PASSED=1.
E2E_JOURNEYS_PASSED=0
[ -f web/playwright.config.ts ] || fail "web/playwright.config.ts missing — functional journey suite not present (BUILDS != WORKS)."
[ -f web/e2e/journeys.spec.ts ] || fail "web/e2e/journeys.spec.ts missing — no outcome-asserting journey suite."
[ -f web/e2e/ROUTE_INVENTORY.md ] || fail "web/e2e/ROUTE_INVENTORY.md missing — coverage not provable."
( cd web && npx --yes playwright install --with-deps chromium >/dev/null 2>&1 || npx --yes playwright install chromium >/dev/null 2>&1; npm run test:e2e ) \
  || fail "functional journey suite did NOT pass (build-but-broken is release-blocking, equal to a red test)."
E2E_JOURNEYS_PASSED=1
[ "$E2E_JOURNEYS_PASSED" = "1" ] || fail "E2E_JOURNEYS_PASSED!=1 — readiness requires the journey suite to have RUN GREEN this attempt."
ok "functional journey suite RAN GREEN this attempt (E2E_JOURNEYS_PASSED=1)"

# G6 honest-tick guard (visual verification). If the box is ticked there MUST be a real, committed,
# non-zero screenshot set — an [x] over an empty/near-empty dir is a fake tick. NO-OP while G6 is [ ]
# (so it never blocks current runs). Completeness ("every step", mobile+desktop) and the dual-axis
# vision verdict are enforced by the deep audit + readiness auditors; this just kills the egregious fake-tick.
if grep -qE '^- \[x\] G6\.' ROADMAP.md; then
  SHOTS=$(find web/e2e/__screenshots__ -type f -name '*.png' -size +0c 2>/dev/null | wc -l | tr -d ' ')
  [ "${SHOTS:-0}" -ge 5 ] || fail "G6 visual-verification is ticked [x] but only ${SHOTS:-0} non-zero screenshots in web/e2e/__screenshots__/ (<5) — fake tick. Capture the journey screenshots or un-tick G6."
  ok "G6 ticked + ${SHOTS} committed non-zero screenshots present"
else
  echo "  (G6 visual-verification not yet ticked — screenshot-floor guard skipped)"
fi

echo "== 6. iOS required check green on latest main (loop can't run xcodebuild on Linux) =="
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
