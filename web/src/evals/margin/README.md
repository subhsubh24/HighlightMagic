# Margin cost-per-outcome eval — `highlightmagic-tape`

A repo-specific eval suite + runner that drives a **real, representative input matrix**
through HighlightMagic's **real metered path** (scorer → planner → validator) so
[Margin](https://github.com/subhsubh24/Margin.ai) accumulates a genuine **statistical
cost-per-outcome distribution** for the `highlightmagic-tape` workflow — not a single happy path.

## Files
| File | What it is | Runs in CI? |
| --- | --- | --- |
| `input-matrix.ts` | 50 cases = 5 content types (sports, cooking, gaming, travel, music) × 10 structural variants (length × hook strength × difficulty × single/multi-source), incl. deliberately **weak** and **hard** cases. | imported by the test |
| `grader.ts` | Pure grader off the **real validator signal**: `qualityScore = 1 - min(issues,5)/5` (the exact formula the app emits), `qualityMethod="llm_judge"`. Never always-pass. | imported by the test |
| `grader.test.ts` | **Keyless** gate test (part of the required `web` check): validates the grader math + matrix variety with **no API calls**. | ✅ yes |
| `margin-eval.eval.ts` | The **gated** runner (`EVAL_MODE=1`). Drives the real metered path, cost-capped, fail-safe. | ❌ never (on-demand only) |

## How to run

**Structure-only (no keys, no API calls)** — validates the matrix + grader wiring:
```bash
EVAL_MODE=1 npx tsx web/src/evals/margin/margin-eval.eval.ts --dry-run
```

**Real, cost-capped batch → emits to Margin:**
```bash
EVAL_MODE=1 \
ANTHROPIC_API_KEY=sk-ant-... \
MARGIN_INGEST_URL=https://margin-ai-rho.vercel.app \
MARGIN_INGEST_KEY=mk_... \
npx tsx web/src/evals/margin/margin-eval.eval.ts --max-usd 1.00 --score-samples 3
```

### Flags
- `--dry-run` — no API calls; print the selected matrix + a grader demonstration.
- `--max-usd <n>` — stop before **estimated** cumulative cost exceeds this (default `1.00`). Real cost is metered.
- `--limit <n>` / `--content <type>` / `--difficulty <easy|medium|hard>` — slice the matrix.
- `--score-samples <k>` — how many cases also run the real vision scorer (default `3`).
- `--run-id <id>` — batch id → `sessionId="eval:<id>"` for re-runnable, distinctly-grouped batches.

The planner (Sonnet + thinking) is the slow/expensive stage, so the default `$1.00` cap runs
~10–16 cases. Raise `--max-usd` / `--limit` for the full 50-case matrix.

## What reaches Margin
The app path already wraps each Claude call with the `margin-meter` SDK, so the runner's
scorer/planner/validator **calls** and each validator **outcome** are emitted with
`workflowId="highlightmagic-tape"`. The runner additionally stamps the batch with
`sessionId="eval:<runid>"` (via `setMeterSessionId` — **production is untouched**) so Margin
can isolate the eval batch's economics.

## Safety
- **Gated:** the runner exits unless `EVAL_MODE=1`; the keyless CI gate never spends.
- **Fail-safe:** no `ANTHROPIC_API_KEY` → clean exit (use `--dry-run`); no `MARGIN_INGEST_KEY`
  → runs but emits nothing (documented no-op).
- **Rate-limit-safe:** each validator call uses a unique client IP so the paid per-IP limiter never trips.

## Honesty / documented gaps
- Score profiles are **synthetic-but-representative** (same technique as `detect.eval.ts`); the
  variety in hook strength / pacing / structure is what makes the **outcome** distribution real.
- The scorer is exercised on a small **fixed** real-pixel fixture set (`fixtures/media/`); content
  variety lives in the planner/validator inputs.
- The validator runs **text-only** by default (no per-case real frames) — a genuine review.
- `margin-meter` v0.1.0 outcomes carry no `sessionId` field, so **outcome** rows group by
  `workflowId` + time while **call** rows carry the eval `sessionId`.
- A true **per-model** override is out of scope here: the models are compile-time constants in the
  app path, which this suite does not modify. Re-run distinct configs via `--run-id`.
