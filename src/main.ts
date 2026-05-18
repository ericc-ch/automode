import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { RunContext, WorkflowConfig } from "./lib/config.ts"
import { Agent, layerOpencode } from "./lib/agent.ts"
export { RunContext, WorkflowConfig } from "./lib/config.ts"
export type { Config as Workflow } from "./lib/config.ts"

export const run = (workflowName: string) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Starting workflow: ${workflowName}`)

    const config = yield* WorkflowConfig
    const workflow = yield* config.load(workflowName)
    yield* Effect.logInfo(`Loaded workflow: ${workflowName}`)

    const agent = yield* Agent
    let ctx = new RunContext({ iteration: 1 })

    while (workflow.shouldContinue(ctx)) {
      yield* Effect.logInfo(`Iteration ${ctx.iteration + 1} starting`)

      const promptText = workflow.prompt(ctx)
      yield* Effect.logInfo(`Prompt: ${promptText.substring(0, 100)}...`)

      yield* agent.run({ prompt: promptText })

      yield* Effect.logInfo(`Iteration ${ctx.iteration + 1} completed`)

      ctx = new RunContext({ iteration: ctx.iteration + 1 })
    }

    yield* Effect.logInfo("Workflow completed")
  })

const layers = Layer.empty.pipe(
  Layer.merge(WorkflowConfig.layer),
  Layer.merge(layerOpencode),
  Layer.provideMerge(NodeServices.layer),
)

NodeRuntime.runMain(Effect.provide(run("test"), layers))
