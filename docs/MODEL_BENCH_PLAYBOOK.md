# Model Cost/Quality Re-Benchmark Playbook (ROADMAP B5)

HighlightMagic is API-heavy, so **per-export API cost ≈ COGS ≈ the margin**. The cheapest-capable
model TODAY is not the cheapest-capable model next month (new models ship; prices drop). This is the
durable method the factory follows to keep model choices cost-optimal **without silently losing
quality**. It is a recurring re-evaluation of B4 — never a one-and-done.

## When to run
- **Monthly** (full bench across all paid tasks), AND
- **On-signal** — immediately when WebSearch surfaces a new/cheaper capable model or a price change
  for any provider (Anthropic / ElevenLabs / AtlasCloud-Kling).
- Evals cost real API spend (`RUN_EVALS=1`), so do NOT run this every 6h cycle.

## The tasks (each has its OWN quality bar; centralized in `web/src/lib/ai-models.ts`)
| Task | Const | Incumbent (verify in code) |
|---|---|---|
| Frame scoring (detection) | `CLAUDE_FRAME_SCORER` | Haiku |
| Planner | `CLAUDE_PLANNER` | Sonnet |
| Validator | `CLAUDE_VALIDATOR` | Haiku |
| TTS / voiceover | `ELEVENLABS_TTS` | eleven_flash_v2_5 |
| Photo/video generation | Kling (`web/src/lib/atlascloud.ts`/`kling.ts`) | kling-v2.5-turbo-pro |

## Method (per task)
1. **DISCOVER candidates** — WebSearch the provider's current catalog + price (USD/M tokens or
   per-unit) and any cheaper hosted/open models that could do the task. **Record real, cited prices**
   in docs/MODEL_COSTS.md — never invent a number.
2. **TRIAL** — point the task's const in `web/src/lib/ai-models.ts` at the candidate (one-line, behind
   the registry; nothing else changes).
3. **VALIDATE on BOTH axes — quality FIRST:**
   - **QUALITY (gate):** run the G3 eval suite (`RUN_EVALS=1`) for that task against the gold set.
     The candidate must hold within the **quality floor** (no eval-score regression beyond the
     pre-set tolerance for that task; report the score + N). If the eval set is too thin to detect a
     regression, EXPAND it first — a thin eval rubber-stamps a worse model.
   - **FLOW (gate):** run the G4 functional journey suite so the candidate's REAL responses still
     drive the app end-to-end (response parsing, no crashes, an export still yields a real file).
   - **COST (gate):** measure real per-export COGS for the candidate (the `[CostMeter]` logs /
     docs/MODEL_COSTS.md). Compute the delta.
4. **DECIDE — ADOPT-ON-GATES (autonomous):** adopt the candidate **iff** quality-held **AND**
   COGS drops a meaningful margin **AND** the functional suite stayed green — merged through the
   normal 2-reviewer + CI + eval gate. Otherwise **REVERT** to the incumbent and record why. The swap
   is one line and reversible; keep the incumbent id in the decision log so a regression can roll back.
5. **RECORD + RECOMPUTE** — append a dated entry to the model decision log (task, candidate,
   eval score vs incumbent + N, COGS before/after, verdict + reason) in docs/MODEL_COSTS.md, and
   **recompute docs/BUSINESS_CASE.md unit economics** on any adopted change (margin gates how much
   ARR is profit).

## Hard rules
- **Quality floor is non-negotiable.** Cost is only the *second* gate; a cheaper model that fails the
  eval floor is REJECTED even if it's far cheaper. "It still runs" (functional green) is NOT quality.
- **Real pricing only**, cited + dated. Never invent a price; never pick a model just to move a COGS
  number (anti-gaming — Reviewer B + the readiness auditors reject it).
- **Per-task, not global** — adopt independently; the planner may keep a pricier model the frame
  scorer doesn't need.
- **Reversible** — registry-only change; on any post-adopt quality complaint, roll back via the log.
- Statistical honesty (per docs/growth/ANALYSIS_PLAYBOOK.md): report eval N; if the gold set is too
  small to be conclusive, say "insufficient eval coverage" and expand it rather than claim a pass.

## Pointers
- Model registry: `web/src/lib/ai-models.ts` (+ `atlascloud.ts`/`kling.ts`).
- Costs + decision log: `docs/MODEL_COSTS.md`. Evals: `web/src/evals/` (G3). Functional: `web/e2e/` (G4).
- Unit economics scoreboard: `docs/BUSINESS_CASE.md`.
