# Long-running agents: patterns, comparisons, and a shared abstraction

This document compares three concrete approaches—**Codex `/goal`**, **Ralph** (a shell loop around OpenCode), and **pi-autoresearch** (a Pi extension)—and names the **underlying idea** they all instantiate so you can reuse the concept across products and agents.

---

## One-sentence essences

- **Ralph:** A **shell loop** that repeatedly runs `opencode run` with a fixed `prompt.md`; **plan** and **progress** live in files (`plan.md`, `progress.txt`). Each iteration is a **new process** → the model gets **fresh context** every time; continuity is **entirely file-based**.

- **Codex `/goal`:** A **single persisted objective** on the thread, plus optional **idle continuation** (the runtime may start **another turn** without a new user message when the session is idle), and a **strict completion step** (`update_goal` → complete). The agent usually stays in **one long-lived session** with **continuous** context unless compacted or split.

- **pi-autoresearch:** **Pi** extension for an **experiment loop**: change code → **`run_experiment`** (benchmark script) → **`log_experiment`** (record result, **commit on keep / revert on discard**). State lives in **`autoresearch.md`** and **`autoresearch.jsonl`** so a **new** model or a **post-compaction** session can **resume by re-reading files**. Optimized for **measurable** targets (latency, loss, bundle size), not arbitrary prose missions.

---

## The shared abstraction

All three are instances of:

> **Persist the mission and the ledger outside the model; run the model in short episodes; a scheduler decides when the next episode runs and ensures each episode re-syncs from storage so limited context does not erase intent.**

Shorter names that capture the same idea:

- **Durable mission + episodic worker**
- **Orchestrated autonomy** (orchestrator + worker, not one infinite chat)

The **hard problem** is always: **context is finite, work is long, and “done” must be recognizable** (by the human, by the shell, or by the product). Files, JSONL, thread goals, and continuation prompts are **different implementations** of storage and scheduling for that problem.

---

## Reusable “slots” (same shape, different fillings)

| Slot                      | Role                                     | Typical fillings                                                                                         |
| ------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Mission store**         | What “success” refers to; the north star | Thread goal text, `plan.md`, `autoresearch.md`                                                           |
| **Progress store**        | What has been tried / decided            | `progress.txt`, rollout history, `autoresearch.jsonl`, git log                                           |
| **Episode trigger**       | When to run the next model episode       | Idle in session, `sleep` + next `opencode run`, after `log_experiment`, post-compaction steer            |
| **Episode contract**      | What every episode must do before acting | Read plan + progress; read autoresearch tail; continuation + `get_goal`                                  |
| **Termination predicate** | When the orchestrator stops scheduling   | `update_goal(complete)`, `<promise>COMPLETE</promise>`, user stops, `maxIterations`, `/autoresearch off` |
| **Side-effect policy**    | What gets committed when                 | Per-task git commit (Ralph); keep/discard + git (autoresearch); ordinary Codex usage                     |
| **Feedback channel**      | Optional measurable signal               | Benchmark metric + confidence; tests; none                                                               |

`/goal` leans on **mission store + idle trigger + strict termination**.  
Ralph leans on **files for mission/progress + outer-loop trigger + sentinel termination**.  
pi-autoresearch leans on **progress store + tools + git policy + metric feedback**.

---

## Side-by-side comparison

|                                 | **Codex `/goal`**                                                                                                                        | **Ralph**                                       | **pi-autoresearch**                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| **Primary job shape**           | Any long coding task you describe                                                                                                        | Checklist implementation from `plan.md`         | Numeric optimization (metric up/down)                                 |
| **Continuity mechanism**        | Persisted goal + same session (often)                                                                                                    | New process each iteration; files are memory    | Files + jsonl; extension re-steers after compaction                   |
| **“Run again”**                 | May **chain another turn when idle** (no queued user input)                                                                              | Explicit **`while` loop** + delay               | Agent loop + tools; **idle after compaction** → re-read session files |
| **“Done”**                      | Tool: mark goal **complete** (not just chat)                                                                                             | Output contains completion **sentinel**         | Human stop, **max iterations**, or leave mode                         |
| **Usage “charged” to the goal** | Counters on the goal record (time/tokens); mainly **product/UI/limits**; can surface in continuation text or **budget-limited** steering | Not modeled (you can add counters in the shell) | Per-run rows in jsonl + widget; not the same as “thread goal budget”  |

---

## Terms we used in discussion

### “Chain another turn when idle”

One **turn** is one cycle of the model running (with tools) until it stops. **Idle** means that turn finished and **nothing else is queued** (no pending user message, no other scheduled work). In Codex-style goals, the product may then **start another turn automatically**, feeding a **continuation** instruction (“keep working toward this objective…”) without the user typing again.

### “Standing behavior”

The **baseline** the agent always has: system instructions from the product, available tools, safety policy, default modes. That is **not** your per-repo `prompt.md`; it is the **fixed layer**. A `/goal` objective is **extra persistent intent** on top; a **continuation** message is a **temporary** add-on for one auto-started turn.

### Does usage “charged to the objective” matter to the model?

**Mostly no** for reasoning—it is **attribution** for the product (dashboards, optional **token budgets**, summaries). It **can** affect the model if **budget text** appears in injected messages or if status becomes **budget-limited** and the runtime adds steering. If you ignore budgets, treat it as **telemetry**, not magic fuel for intelligence.

---

## Is `/goal` “Ralph without `prompt.md`”?

**Roughly similar in spirit** (durable objective, keep going until real completion)—but **not** the same as “Ralph minus one file.”

- Codex still has **system** behavior and **tools**; there is no absence of instructions—your **`prompt.md`** is replaced by **product prompts + optional continuation**, not by nothing.
- Ralph **always** gets a **fresh** context window each `opencode run`; `/goal` usually **extends one session** (unless you compact or restart).
- Ralph’s **checklist** is first-class in **`plan.md`**; `/goal` is usually **one objective string** (you can still write “follow `plan.md`” inside that string).

So: **`/goal` ≈ sticky mission + in-session idle continuation + strict completion tool.**  
**Ralph ≈ many short agents + files as memory + your loop decides the next run.**

---

## Combining ideas (e.g. Ralph-style plan + `/goal`)

They compose cleanly if you **avoid duplicating** the source of truth:

- **`/goal` text:** a short pointer, e.g. “Execute the plan in `plan.md`, log to `progress.txt`, follow `prompt.md`.”
- **Ralph layer:** `plan.md` / `progress.txt` / `prompt.md` remain the **detailed** mission and ledger.

The **big** difference remains **one long-lived session vs a new subprocess each time**, not whether you use a plan file.

---

## pi-autoresearch vs the others (conceptual)

- **Same abstraction:** durable mission (`autoresearch.md`) + ledger (`autoresearch.jsonl`) + episodic agent + scheduler (tool loop + compaction handling).
- **Different emphasis:** **measurement and git discipline per try** (`run_experiment` / `log_experiment`, keep vs discard). It is a **science loop**, not a generic “finish this feature” primitive—though you can frame work as optimization if you define a metric and script.

---

## What to reuse when designing for “any coding agent”

1. **Split intent from execution:** intent and history live **outside** the model (DB, files, jsonl).
2. **Define an episode:** one invocation with a clear **sync step** (“read these artifacts first”).
3. **Define a scheduler:** what event causes the **next** episode (idle, timer, tool completion, shell loop).
4. **Define termination** as something **machine-checkable** when possible (tool, sentinel, iteration cap)—not only natural language “we’re done.”
5. **Optional:** feedback signal (tests, metrics) and side-effect rules (commit/revert policy).

If you fill those five bullets, you have recreated the family: `/goal`, Ralph, and pi-autoresearch are **parameter choices**, not different species.

---

## References in this repo

- **Codex** behavior described here is inferred from the vendored reference under `.references/codex/` (goals, continuation, TUI slash dispatch). Treat that tree as read-only reference, not a dependency contract.
- **pi-autoresearch** is described from `.references/pi-autoresearch/` (README and extension intent).
- **Ralph** here matches the common `ralph.fish` loop pattern (plan/progress/prompt files + repeated `opencode run`).

Update this doc if your local forks of those tools diverge materially.
