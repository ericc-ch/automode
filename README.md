# automode

TypeScript CLI and library for **looping coding agents** with workflow logic in **`.automode/<workflow>/config.ts`** (`prompt`, `shouldContinue`, `RunContext`).

See **`PLAN.md`** for roadmap, repo layout, and contracts.

## Vocabulary

- **Run** — One invocation of automode (for example the whole `automode run <workflow>` from start to exit).
- **Session** — One bounded stretch of agent work: from giving the agent a prompt until that **session** completes (no further tool calls; the agent runtime considers that pass finished).

A **run** may include many **sessions** in a loop controlled by your workflow config.

## Commands

- **`automode init <workflow>`** — Scaffold `.automode/<workflow>/config.ts`.
- **`automode run <workflow>`** — Planned primary entry: one **run**, multiple **sessions** until `shouldContinue` is false (see `PLAN.md` for status).

## Docs

- **`PLAN.md`** — Product plan and behavior.
- **`docs/agent-orchestration-patterns.md`** — How this compares to Ralph, Codex `/goal`, and pi-autoresearch (includes the same **run** / **session** definitions for automode).

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/E1E519XS7W)
