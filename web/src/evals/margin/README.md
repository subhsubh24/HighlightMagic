# Margin cost-per-outcome eval — `highlightmagic-tape`

A repo-specific eval suite + runner that drives a **real, representative input matrix**
through HighlightMagic's **real metered path** (scorer → planner → validator) so
[Margin](https://github.com/subhsubh24/Margin.ai) accumulates a genuine **statistical
cost-per-outcome distribution** for the `highlightmagic-tape` workflow — not a single happy path.

The tape is a **supply chain** of three LLM operations, and this harness measures BOTH the
end-to-end chain AND each operation as its own graded node (`--suite`). See **[COVERAGE.md](./COVERAGE.md)**
for the full map of every LLM operation in the repo, what is metered/evaled, and the frontier.

## Files
| File | What it is | Runs in CI? |
| --- | --- | --- |
| `input-matrix.ts` | Tape matrix: 50 cases = 5 content types (sports, cooking, gaming, travel, music) × 10 structural variants (length × hook strength × difficulty × single/multi-source), incl. deliberately **weak** and **hard** cases. | imported by the test |
| `grader.ts` | Tape grader off the **real validator signal**: `qualityScore = 1 - min(issues,5)/5` (the exact formula the app emits), `qualityMethod="llm_judge"`. Never always-pass. | imported by the test |
| `operations.ts` | **Per-operation** node definitions + **genuine per-operation graders**: scorer (well-formed/non-degenerate/robust), planner (valid/coherent plan), validator (**discrimination**: pass good, flag bad). Plus per-op **edge/fuzz** matrices. | imported by the test |
| `grader.test.ts` / `operations.test.ts` | **Keyless** gate tests (part of the required `web` check): validate the graders + matrices with **no API calls**. | ✅ yes |
| `margin-eval.eval.ts` | The **gated** runner (`EVAL_MODE=1`). Drives the real metered path for any suite, cost-capped, fail-safe. | ❌ never (on-demand only) |
| `COVERAGE.md` | The enumeration/frontier map of every LLM operation. | doc |

## Suites (`--suite`)
| `--suite` | Node workflow id | What it exercises | Grader |
| --- | --- | --- | --- |
| `tape` (default) | `highlightmagic-tape` | the whole chain on the 50-case matrix | `1 - min(issues,5)/5` |
| `scorer` | `highlightmagic-scorer` | real vision scorer on normal + **edge/fuzz** pixels (noise, black, white, tiny, duplicate) | well-formed + non-degenerate + robust |
| `planner` | `highlightmagic-planner` | `planFromScores` on the matrix + **degenerate/adversarial** score profiles (all-zero, identical, single-frame, injection labels, dense) | valid + coherent plan |
| `validator` | `highlightmagic-validator` | `/api/validate` on **labelled good/bad** tapes + fuzz | **discrimination** (pass good, flag bad) |
| `all` | (each of the above) | scorer → planner → validator → tape, sharing the `--max-usd` budget | per-suite |

Per-operation runs re-tag the app's emits under the node's own workflow id (production untouched;
see `setMeterWorkflow` in `margin-meter-client.ts`) + `sessionId="eval:<op>:<runid>"`, so Margin
gets each node's cost + graded outcome distinctly — the supply-chain view.

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
- `--suite <scorer|planner|validator|tape|all>` — which node(s) to run (default `tape`).
- `--dry-run` — no API calls; print the selected cases + a grader demonstration.
- `--max-usd <n>` — stop before **estimated** cumulative cost exceeds this (default `1.00`, shared across suites). Real cost is metered.
- `--limit <n>` — cap cases per suite. `--content <type>` / `--difficulty <easy|medium|hard>` — slice the tape/planner matrix.
- `--score-samples <k>` — tape only: how many cases also run the real vision scorer (default `3`).
- `--run-id <id>` — batch id → `sessionId="eval:[<op>:]<id>"` for re-runnable, distinctly-grouped batches.

Per-operation example:
```bash
EVAL_MODE=1 npx tsx web/src/evals/margin/margin-eval.eval.ts --dry-run --suite all
EVAL_MODE=1 ANTHROPIC_API_KEY=... MARGIN_INGEST_URL=... MARGIN_INGEST_KEY=... \
  npx tsx web/src/evals/margin/margin-eval.eval.ts --suite validator --max-usd 0.20
```

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
