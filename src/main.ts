import { createOpencode } from "@opencode-ai/sdk/v2"
import { Effect, Layer } from "effect"
import { RunContext, WorkflowConfig } from "./lib/config.ts"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
export { RunContext, WorkflowConfig } from "./lib/config.ts"
export type { Config as Workflow } from "./lib/config.ts"

export const run = (workflowName: string) =>
  Effect.gen(function* () {
    const config = yield* WorkflowConfig
    const workflow = yield* config.load(workflowName)

    let ctx = new RunContext({ iteration: 0 })

    const opencode = yield* Effect.promise(() => createOpencode())

    while (workflow.shouldContinue(ctx)) {
      const promptText = workflow.prompt(ctx)

      const session = yield* Effect.promise(() => opencode.client.session.create())
      const sessionID = session.data?.id ?? "lmao"

      const result = yield* Effect.promise(() =>
        opencode.client.session.prompt({
          model: {
            providerID: "opencode",
            modelID: "deepseek-v4-flash-free",
          },
          sessionID,
          parts: [{ type: "text", text: promptText }],
        }),
      )

      yield* Effect.log(result)

      ctx = new RunContext({ iteration: ctx.iteration + 1 })
    }

    opencode.server.close()
  })

const layers = Layer.empty.pipe(
  Layer.merge(WorkflowConfig.layer),
  Layer.provide(NodeServices.layer),
)

NodeRuntime.runMain(Effect.provide(run("test"), layers))
