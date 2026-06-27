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

## Candidate space — be creative; same INTENT, cheaper (not just a cheaper same-model)
The goal is the cheapest option that still clears the task's quality bar — explore widely:
- **(a) Cheaper tier, same provider** — a smaller/faster model from the incumbent vendor.
- **(b) Alternative provider/model** — a different vendor's model for that task. Especially for the
  **video-generation** step (Kling, the priciest call): actively WebSearch other text/image-to-video
  models/providers (e.g. other hosted video-gen APIs / open models) that hit the quality rubric for
  less. Cross-provider is in-scope.
- **(c) Cheaper APPROACH for the same user intent** — sometimes the win isn't a model swap at all:
  fewer or no generation calls, a cheaper technique that produces the same user-visible result,
  caching/reuse of near-identical outputs, smaller inputs, or removing a call whose value the eval
  shows is marginal. The user intent (a share-ready highlight) is fixed; the path to it is flexible.
Lower COGS → higher gross margin → more of every dollar is profit → hit AND exceed the revenue/profit
floor. The quality rubric is the only thing that's fixed; the candidate is not.

## Method (per task)
1. **DISCOVER candidates** — WebSearch the provider's current catalog + price (USD/M tokens or
   per-unit), cheaper hosted/open models, ALTERNATIVE providers, AND cheaper approaches (per the
   candidate space above). **Record real, cited prices** in docs/MODEL_COSTS.md — never invent a number.
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

## Video-generation quality rubric (the priciest + most subjective call — makes it gate-able)
The Kling intro/outro/photo-animation step is usually the largest single per-export cost, so a
cheaper video model/provider/approach is the biggest margin lever — but video quality is subjective,
so it needs a RUBRIC before it can be auto-adopted. Score each candidate on a small, fixed gold set
of representative prompts/inputs:
- **Prompt/intent adherence** — does the clip depict what was asked (subject, action, scene)?
- **Temporal coherence / motion** — smooth, plausible motion; no flicker, morphing, or warping.
- **Artifact-free** — no melted faces/hands, no garbled text, no obvious generation artifacts.
- **Technical correctness** — correct aspect (vertical 1080×1920 framing), duration, fps, resolution.
- **Brand/safety fit** — on-tone for HighlightMagic; nothing unsafe/off-brand.
Scoring (no human in the loop each run): score each dimension 1–5 with a **vision model as judge**
against the incumbent's output on the SAME inputs (A/B, incumbent = reference); require the candidate
to be **≥ incumbent within tolerance** on every dimension. Report per-dimension scores + N.
- **Until this rubric is built + trustworthy:** a cheaper video candidate is a **FLAGGED** candidate —
  open an FYI issue with the rubric scores + COGS delta for **human sign-off**, do NOT auto-swap.
  This is the one explicit exception to B5's ADOPT-ON-GATES (text/LLM tiers with solid evals still
  auto-adopt). Once the rubric reliably catches a regression (validated against known-worse outputs),
  video swaps can join ADOPT-ON-GATES.
- A borderline vision-judge score → "insufficient confidence," keep the incumbent (per
  docs/growth/ANALYSIS_PLAYBOOK.md significance discipline). Keep a human-rated reference set to
  periodically re-validate that the judge agrees with human taste.

## Pointers
- Model registry: `web/src/lib/ai-models.ts` (+ `atlascloud.ts`/`kling.ts`).
- Costs + decision log: `docs/MODEL_COSTS.md`. Evals: `web/src/evals/` (G3). Functional: `web/e2e/` (G4).
- Unit economics scoreboard: `docs/BUSINESS_CASE.md`.
