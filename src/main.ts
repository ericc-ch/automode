import { createOpencode } from "@opencode-ai/sdk/v2"
import { Effect } from "effect"
import { RunContext, WorkflowConfig } from "./lib/config.ts"

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

      yield* Effect.promise(() =>
        opencode.client.session.prompt({
          sessionID,
          parts: [{ type: "text", text: promptText }],
        }),
      )

      ctx = new RunContext({ iteration: ctx.iteration + 1 })
    }

    opencode.server.close()
  })
