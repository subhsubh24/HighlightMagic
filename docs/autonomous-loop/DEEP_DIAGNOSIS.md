# Deep Diagnosis — "it builds/deploys but the user hits an error"

The method for any reported runtime failure where the build is green but a real user hits an error.
Diagnose by OBSERVING the real system, not by reading code and theorizing. Record every incident in
the loop-memory file (LOOP_MEMORY.md) with a dated entry: symptom → evidence → root cause → fix → proof.

> Stack note (adapt the tools to THIS repo). HighlightMagic = Next.js on **Vercel** + an **optional
> Vercel KV** datastore (in-memory fallback when unset); there is **no SQL DB / Supabase** here, so
> the SQL/`execute_sql`/`get_logs` steps below map to: **Vercel function logs**, the **deployed-URL
> journey replay**, and **KV inspection**. If a SQL DB is ever added, use its query/log tooling for
> the data-layer steps.

## The method

1. **Observe the REAL environment — don't read code and theorize.** Pull the live evidence FIRST; it
   usually names the cause in seconds:
   - **Logs:** Vercel function logs (`vercel logs <deployment-url>` or the Vercel dashboard → the
     failing function). The error-boundary copy ("Something went wrong") tells you which route threw.
   - **Reproduce the exact user journey against PROD:** `BASE_URL=https://<prod-host> npm run test:e2e`
     (pins the failure to the deployed env) or drive it in a browser.
   - **Data:** inspect Vercel KV (the quota / waitlist / social stores) via the KV REST API or the
     Vercel dashboard; note whether KV is even configured (in-memory fallback when `KV_REST_API_*`
     unset). Confirm a row/key is or isn't created.
2. **BUILDS ≠ WORKS — separate three layers with evidence before changing anything:**
   - **code** (a real bug), **data** (KV/schema/migration drift, bad/missing keys), **config**
     (missing/wrong env var, wrong base URL, a provider key unset → silent dry-run/no-op).
   - Decide which with evidence. *"No effect produced + no app error + no outbound provider call"* →
     it's **config** (e.g. a key unset, so the integration is in dry-run). *"Outbound call made +
     provider 4xx/5xx"* → code/data. Don't guess.
3. **Form ONE hypothesis, then PROVE it against the live system.** Run the exact failing operation in
   the real env (the precise KV write under the deployed config; the exact provider call with the
   real key in sandbox); diff the code's expected shape vs the live data/keys; confirm the
   effect is/isn't produced. If you can't prove it, you don't understand it yet.
4. **Find the UNCAUGHT throw.** A `try/catch` that degrades gracefully cannot be the source of a hard
   error screen — hunt the **unguarded** call: a bare `await req.json()` / session read, a
   `process.env.X!` deref, a DB/KV call outside the try, an LLM/3rd-party `fetch` with **no timeout**.
   The error-boundary route names where it threw.
5. **Verify the fix in the REAL system, not the build.** Watch the new KV key appear / the journey
   complete against the deployed URL / the provider call succeed in sandbox. "Tests pass" is
   necessary, not sufficient. If you can't click it, verify in the data and SAY SO.
6. **Fix the ROOT cause + regression test + make it fail LOUD next time.** Never paper a config bug
   with a code workaround. Turn the silent trap that hid it (a swallowed catch, an optional env, an
   un-timed call) into a loud error or a bounded call, and add a test that fails if it regresses.
7. **Peel the layers — fixing one error reveals the next.** (One sibling outage had four stacked
   causes.) Keep going until the REAL journey works end to end, not until the first error disappears.
8. **Stay honest.** Change your diagnosis the moment evidence contradicts it; never claim "fixed"
   without proof in the real system.

## Two hard rules (from real outages)

- **(a) Timeout < the serverless function budget.** Any external / LLM / 3rd-party call MUST have an
  explicit timeout shorter than the Vercel function's max duration — a graceful `try/catch` is
  USELESS if the runtime kills the function first (the await never returns; the user gets a hard
  error or a hung request). Use `AbortSignal.timeout(ms)` (or an `AbortController`) on every outbound
  `fetch`, bounded under the function budget.
- **(b) A required-but-`.optional()` env var is a latent outage.** If a critical path actually
  requires an env var, it must FAIL LOUD when missing — not silently default, dry-run, or `undefined`
  its way into a confusing downstream error. Validate critical env at the entry of the path and throw
  a clear, named error (or honestly gate/disable the feature per SIDE-EFFECT INTEGRITY).

## Incident log
Record each incident in LOOP_MEMORY.md (dated): symptom, the evidence that named the cause, the layer
(code/data/config), the root cause, the fix, and the PROOF it works in the real system.
