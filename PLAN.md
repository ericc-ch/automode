# automode — product plan

## Vocabulary

- **Run** — One invocation of automode from entry to exit (for example the whole `automode run <workflow>` process).
- **Session** — One bounded stretch of agent work: from giving the agent a prompt until that agent **session** ends (no further tool calls; the agent runtime treats that pass as finished).

A single **run** may contain many **sessions** in a loop: each time `shouldContinue` is true, automode starts another **session** with a fresh `prompt(ctx)` (exactly how depends on the **agent** backend—subprocess, Cursor SDK, OpenCode, etc.).

External CLI that orchestrates coding agents: **workflow logic in TypeScript** plus pluggable **agents** (OpenCode, Cursor SDK, …). The runner assumes only **`.automode/<workflow>/config.ts`**. Mission text, checklists, logs, or sentinels are entirely up to your `prompt` and `shouldContinue` implementations (read files, grep git, parse stdout, etc., if you want).

---

## Positioning

- **vs Ralph:** Same **outer loop** idea, but **workflow is code** (direct `Config` export), **prompt and stop conditions are explicit functions**, and **multiple agents** via `--agent` / pluggable **agent** backends. Ralph’s `plan.md` / `progress.txt` pattern is one possible implementation inside your functions—not a framework requirement.
- **vs Codex `/goal`:** We do not own the agent runtime; we **cannot** inject idle continuation or `update_goal` tools. We **can** gate the loop inside a **run** (sentinel in stdout, post-session checks, max iterations) in **`shouldContinue`** and friends.
- **vs pi-autoresearch:** No `run_experiment` / `log_experiment` tools unless the **agent** exposes them. Optional later: workflows that wrap benchmark scripts from config code, not as a core requirement.

---

## CLI surface

| Command                       | Purpose                                                                                                                        | Status      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| **`automode init`**           | Scaffold `.automode/<example>/` with `config.ts` and `.gitignore` hints (optional `artifacts/`).                               | Implemented |
| **`automode run <workflow>`** | Load `.automode/<workflow>/config.ts`, execute one **run** (loop **sessions** until `shouldContinue` is false).                | In progress |
| **`automode doc [topic]`**    | **Go `doc`-style:** show bundled markdown for a topic; use `$PAGER` when TTY. Optional later: `--online` to fetch latest docs. | Not yet     |

**No** required `automode run` subcommand for the default path if desired: **`automode --agent cursor …`** can imply `run`—but **`automode run <workflow>`** stays the clear primary for multi-workflow repos.

Root **`automode`** with no args: short help + pointer to **`automode doc`**.

---

## Repo layout (per workflow)

Everything for one workflow lives under **`.automode/<workflow>/`**:

```
.automode/
  <workflow>/
    config.ts       # export default { prompt, shouldContinue } satisfies Config
    artifacts/      # optional: transcripts, captures (recommended gitignored)
```

- **`config.ts`** — Sole required artifact: exports the workflow as a **`Config`** object (direct default export, no factory).
- **`artifacts/`** — Optional; runner or **agent** may drop stdout/stderr, transcripts, etc. Not prescribed for v1 beyond “a place to put bulky output if the **agent** supports it.”

You may add **any other files** (`plan.md`, `progress.txt`, JSONL, etc.) as your own convention; **automode does not read or write them unless your `prompt` / `shouldContinue` code does.**

---

## Workflow authoring (`config.ts`)

**`config.ts`** directly exports an object matching the **`Config`** interface (no factory). The runner loads it and uses **`prompt(ctx)`** / **`shouldContinue(ctx)`** for the loop inside a **run**.

```ts
export default {
  prompt: (ctx) => {
    // Return the full string sent to the agent before this session.
    // Read files, template literals, build from ctx — all allowed.
    return `You are in iteration ${ctx.iteration}. …`
  },

  shouldContinue: (ctx) => {
    // Return false to end this automode run (no further sessions).
    return ctx.iteration < 50 /* && !fs.existsSync("DONE") */
  },
} satisfies Config
```

**Contracts:**

- **`prompt: (ctx: RunContext) => string`** — Called **before each session**. **Fully user-controlled**; the runner does not merge hidden instructions beyond global CLI flags and **agent** defaults.
- **`shouldContinue: (ctx: RunContext) => boolean`** — Pure **boolean** continuation. When it returns **`false`**, the runner does not start another **session** in this **run**.

---

## SDK / `ctx` (v1 — minimal)

**`prompt(ctx)`** and **`shouldContinue(ctx)`** receive a **`RunContext`** instance (immutable — a new object is created after each **session**). Documented minimum:

| Member              | Role                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| **`ctx.iteration`** | Counter within this **run** (0-based by convention; bumps each loop). |

**Later (when needed):** `cwd`, last exit code, paths to transcript, `ctx.exec`, **agent** / model overrides, signal/abort, etc.

---

## Workflow loop (one run)

Within a single **run**:

1. Resolve **`.automode/<workflow>/config.ts`**, import the default export as the **`Config`** object.
2. Initialize **`ctx = new RunContext({ iteration: 0 })`**.
3. **Loop:**
   - If **`shouldContinue(ctx)`** is **`false`**, exit this **run** (no further **sessions**).
   - Compute **`prompt(ctx)`** and start a **session** with the **agent** using that string.
   - Capture **exit code + optional artifacts** under **`artifacts/`** if configured.
   - Apply **`--max-iterations`** (or config field) as a **hard ceiling** on **sessions** in this **run**, even if **`shouldContinue`** never returns false.
4. After each **session**, create a **new `RunContext`** with **`iteration + 1`**.

**Safety:** global **`--max-iterations`** remains a backstop.

---

## `automode doc`

- Ship markdown under package **`docs/`** (or embedded strings).
- **`automode doc`** lists topics; **`automode doc <topic>`** prints that file through **`$PAGER`** when interactive.
- Optional **`--online`**: fetch same content from published URL (versioned docs).

---

## Persistence philosophy

- **No mandated mission or progress files.** Persistence is **whatever your config reads or writes** (git, optional local files, remote state). The runner only **requires** `config.ts` and defines the loop (**sessions** inside a **run**) plus the **agent** boundary.

---

## Open decisions (track as we build)

- **Agent API:** abstract a small interface (start **session** from prompt + cwd + signal → completion + optional streaming) with backends for OpenCode CLI, OpenCode SDK, Cursor SDK, etc.
- **`doc` command:** not yet implemented (`docs/` has supporting markdown).
- **`init` default workflow name:** e.g. `default` vs `main`.
- **`--max-iterations`:** not yet implemented.

---

## Non-goals (v1)

- Tool enforcement or custom “goal complete” tools inside the **agent** (product-specific; later if an SDK path needs it).
- Autoresearch-style metric ledger in-repo as a **built-in** feature.
- Cross-workflow shared state (use a shared `.ts` import if needed).

---

## Success criteria

- **`automode init`** produces a runnable **`.automode/default/`** (or chosen name) skeleton with **`config.ts`**. _(partially met: `init` exists; polish / defaults TBD)_
- **`automode run <workflow>`** loops **`prompt`**, **`shouldContinue`**, and **`RunContext`** as documented, with **`--max-iterations`** safety. _(loop exists in runner; CLI wiring + max-iterations pending)_
- **`automode doc`** works offline from bundled markdown. _(not yet)_
- **`pnpm run check`** stays green after implementation lands.
