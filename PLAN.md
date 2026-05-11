# automode — product plan

External CLI that orchestrates coding agents in a loop: **episodes** (spawn driver → capture output) with **workflow logic in TypeScript**. The runner makes **no assumptions** about which files exist beyond **`.automode/<workflow>/config.ts`**; mission text, checklists, logs, or sentinels are entirely up to your `prompt` and `shouldContinue` implementations (read `plan.md`, grep git, parse stdout, etc., if you want).

---

## Positioning

- **vs Ralph:** Same **outer loop** idea, but **workflow is code** (`defineConfig`), **prompt and stop conditions are explicit functions**, and **multiple agents** via `--agent` / driver plugins (OpenCode, Cursor SDK, …). Ralph’s `plan.md` / `progress.txt` pattern is one possible implementation inside your functions—not a framework requirement.
- **vs Codex `/goal`:** We do not own the agent runtime; we **cannot** inject idle continuation or `update_goal` tools. We **can** gate the **outer** loop (sentinel in stdout, post-run checks, max iterations) in **`shouldContinue`** and friends.
- **vs pi-autoresearch:** No `run_experiment` / `log_experiment` tools unless the **driver** exposes them. Optional later: workflows that wrap benchmark scripts from config code, not as a core requirement.

---

## CLI surface

| Command                       | Purpose                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **`automode init`**           | Scaffold `.automode/<example>/` with `config.ts` and `.gitignore` hints (optional `artifacts/`).                               |
| **`automode run <workflow>`** | Load `.automode/<workflow>/config.ts`, enter the episode loop.                                                                 |
| **`automode doc [topic]`**    | **Go `doc`-style:** show bundled markdown for a topic; use `$PAGER` when TTY. Optional later: `--online` to fetch latest docs. |

**No** required `automode run` subcommand for the default path if desired: **`automode --agent cursor …`** can imply `run`—but **`automode run <workflow>`** stays the clear primary for multi-workflow repos.

Root **`automode`** with no args: short help + pointer to **`automode doc`**.

---

## Repo layout (per workflow)

Everything for one workflow lives under **`.automode/<workflow>/`**:

```
.automode/
  <workflow>/
    config.ts       # export default defineConfig((ctx) => ({ ... }))
    artifacts/      # optional: transcripts, captures (recommended gitignored)
```

- **`config.ts`** — Sole required artifact: exports the workflow via **`defineConfig`**.
- **`artifacts/`** — Optional; runner or driver may drop stdout/stderr, transcripts, etc. Not prescribed for v1 beyond “a place to put bulky output if the driver supports it.”

You may add **any other files** (`plan.md`, `progress.txt`, JSONL, etc.) as your own convention; **automode does not read or write them unless your `prompt` / `shouldContinue` code does.**

---

## Workflow authoring (`config.ts`)

**`defineConfig`** takes a **factory** that receives a runner-managed **`ctx`** and returns two callables. The runner calls this factory **once** when the workflow starts (load `config.ts` → build initial **`ctx`** → **`defineConfig(ctx)`** → keep the returned **`{ prompt, shouldContinue }`** for the whole run). It invokes **`prompt()`** immediately before each agent spawn and **`shouldContinue()`** at the start of each loop iteration (see **Episode loop** below).

```ts
export default defineConfig((ctx) => ({
  prompt: () => {
    // Return the full string sent to the driver this lap.
    // Read files, template literals, build from ctx — all allowed.
    return `You are in iteration ${ctx.iteration}. …`
  },

  shouldContinue: () => {
    // Return false to end the outer loop (replaces a ctx.stop() side effect).
    return ctx.iteration < 50 /* && !fs.existsSync("DONE") */
  },
}))
```

Naming: **`defineConfig`** (not `defineWorkflow`) to keep mental model “this folder is a config package.”

**Contracts:**

- **`prompt: () => string`** — Called **before each** agent run. **Fully user-controlled**; the runner does not merge hidden instructions beyond global CLI flags/driver defaults.
- **`shouldContinue: () => boolean`** — Pure **boolean** continuation; **no** `ctx.stop()`. When it returns **`false`**, the runner does not start another episode.

---

## SDK / `ctx` (v1 — minimal)

The factory **`defineConfig((ctx) => …)`** receives a **single `ctx` object** (same reference for the whole run). Between laps the runner **mutates** that object (e.g. **`ctx.iteration`**) so closures in **`prompt`** / **`shouldContinue`** always see up-to-date values. Further fields TBD in implementation. Documented minimum:

| Member              | Role                                                             |
| ------------------- | ---------------------------------------------------------------- |
| **`ctx.iteration`** | Lap counter (0- vs 1-based: fix in implementation and document). |
| **`ctx.cwd`**       | Workspace root for this workflow.                                |

**Later (when needed):** last exit code, paths to transcript, `ctx.exec`, driver/model overrides, signal/abort, etc.

---

## Episode loop (runner behavior)

1. Resolve **`.automode/<workflow>/config.ts`**, construct **`ctx`**, call **`defineConfig(ctx)` exactly once** to obtain **`{ prompt, shouldContinue }`**, and keep that pair for the entire episode loop.
2. **Loop:**
   - If **`shouldContinue()`** is **`false`**, exit (no further spawns).
   - Compute **`prompt()`** and spawn the **agent driver** with that string, **`ctx.cwd`**, and driver-specific options from env/CLI.
   - Capture **exit code + optional artifacts** under **`artifacts/`** if configured.
   - Apply **`--max-iterations`** (or config field) as a **hard ceiling** even if **`shouldContinue`** never returns false.
3. Before the next iteration, **mutate `ctx`** (e.g. increment **`ctx.iteration`**, attach last exit code when that exists) on the **same** object passed into **`defineConfig`**.

**Safety:** global **`--max-iterations`** remains a backstop.

---

## `automode doc`

- Ship markdown under package **`docs/`** (or embedded strings).
- **`automode doc`** lists topics; **`automode doc <topic>`** prints that file through **`$PAGER`** when interactive.
- Optional **`--online`**: fetch same content from published URL (versioned docs).

---

## Persistence philosophy

- **No mandated mission or progress files.** Persistence is **whatever your factory reads or writes** (git, optional local files, remote state). The runner only **requires** `config.ts` and defines the **episode loop** + **driver** boundary.

---

## Open decisions (track as we build)

- **Driver API:** first driver (OpenCode subprocess vs Cursor SDK in-process); common interface: `run({ prompt, cwd, signal }) → { exitCode, stdoutPath }`.
- **`init` default workflow name:** e.g. `default` vs `main`.

---

## Non-goals (v1)

- In-session tool enforcement or custom “goal complete” tools (driver-specific; later if SDK path).
- Autoresearch-style metric ledger in-repo as a **built-in** feature.
- Cross-workflow shared state (use a shared `.ts` import if needed).

---

## Success criteria

- **`automode init`** produces a runnable **`.automode/default/`** (or chosen name) skeleton with **`config.ts`** only.
- **`automode run <workflow>`** loops using **`prompt`**, **`shouldContinue`**, and **`ctx`** as documented, with **`--max-iterations`** safety.
- **`automode doc`** works offline from bundled markdown.
- **`pnpm run check`** stays green after implementation land.
