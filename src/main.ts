import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { RunContext, WorkflowConfig } from "./lib/config.ts"
export { RunContext, WorkflowConfig } from "./lib/config.ts"
export type { Config as Workflow } from "./lib/config.ts"

export const run = (workflowName: string) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Starting workflow: ${workflowName}`)

    const config = yield* WorkflowConfig
    const workflow = yield* config.load(workflowName)
    yield* Effect.logInfo(`Loaded workflow: ${workflowName}`)

    let ctx = new RunContext({ iteration: 1 })

    while (workflow.shouldContinue(ctx)) {
      yield* Effect.logInfo(`Iteration ${ctx.iteration + 1} starting`)

      const promptText = workflow.prompt(ctx)
      yield* Effect.logInfo(`Prompt: ${promptText.substring(0, 100)}...`)

      const cmd = ChildProcess.make(
        "opencode",
        ["run", "--dangerously-skip-permissions", promptText],
        {
          stdout: "inherit",
          stderr: "inherit",
          stdin: "inherit",
        },
      )

      const handle = yield* cmd
      yield* handle.exitCode

      yield* Effect.logInfo(`Iteration ${ctx.iteration + 1} completed`)

      ctx = new RunContext({ iteration: ctx.iteration + 1 })
    }

    yield* Effect.logInfo("Workflow completed")
  }).pipe(Effect.scoped)

const layers = Layer.empty.pipe(
  Layer.merge(WorkflowConfig.layer),
  Layer.provideMerge(NodeServices.layer),
)

NodeRuntime.runMain(Effect.provide(run("test"), layers))
