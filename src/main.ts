import { Effect, Schema } from "effect"
import { make, type WorkflowConfigInput } from "./lib/config.ts"

// @ts-ignore - Assuming @cursor/sdk might not be installed yet
import { Agent } from "@cursor/sdk"

export {
  ConfigLoadError,
  Ctx,
  WorkflowConfig,
  defineConfig,
  layer,
  make,
  makeContext,
} from "./lib/config.ts"

export type { CtxType, Workflow, WorkflowConfigInput } from "./lib/config.ts"

export class RunWorkflowError extends Schema.TaggedErrorClass<RunWorkflowError>()(
  "RunWorkflowError",
  {
    cause: Schema.Defect,
  },
) {}

export const runWorkflow = (input: WorkflowConfigInput, maxIterations = 50) =>
  Effect.gen(function* () {
    const config = yield* make(input)
    const { ctx, handlers } = config

    const apiKey = process.env.CURSOR_API_KEY
    if (!apiKey) {
      yield* Effect.logWarning("CURSOR_API_KEY is not set. Agent may fail.")
    }

    // Initialize the Cursor Agent
    const agent = yield* Effect.tryPromise({
      try: () =>
        Agent.create({
          apiKey: apiKey || "dummy-key",
          model: { id: "composer-2" },
          local: { cwd: input.cwd },
        }) as Promise<{ send: (p: string) => Promise<{ stream: () => AsyncIterable<unknown> }> }>,
      catch: (cause) =>
        new RunWorkflowError({
          cause: new Error(`Failed to create Cursor Agent: ${String(cause)}`),
        }),
    })

    // Episode Loop
    while (handlers.shouldContinue() && ctx.iteration < maxIterations) {
      const promptText = handlers.prompt()
      yield* Effect.logInfo(`[Iteration ${ctx.iteration}] Spawning agent...`)

      // Send the prompt to the driver
      const run = yield* Effect.tryPromise({
        try: () => agent.send(promptText),
        catch: (cause) =>
          new RunWorkflowError({ cause: new Error(`Agent run failed: ${String(cause)}`) }),
      })

      // Wait for stream to complete (capturing artifacts/logs)
      yield* Effect.tryPromise({
        try: async () => {
          for await (const event of run.stream()) {
            // Naive logging of agent events
            console.log(`[Agent Event]`, event)
          }
        },
        catch: (cause) =>
          new RunWorkflowError({ cause: new Error(`Agent stream failed: ${String(cause)}`) }),
      })

      // Mutate context for the next lap
      ctx.iteration++
    }

    if (ctx.iteration >= maxIterations) {
      yield* Effect.logWarning(`Max iterations (${maxIterations}) reached.`)
    } else {
      yield* Effect.logInfo(`Workflow finished gracefully after ${ctx.iteration} iterations.`)
    }
  })
