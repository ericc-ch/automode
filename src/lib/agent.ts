import { Agent as CursorAgent } from "@cursor/sdk"
import { Context, Data, Effect, Layer } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { inspect } from "node:util"

export type AgentRunOptions = {
  readonly prompt: string
  readonly cwd?: string
}

export class AgentError extends Data.TaggedError("AgentError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class Agent extends Context.Service<
  Agent,
  {
    run(request: AgentRunOptions): Effect.Effect<void, AgentError>
  }
>()("Agent") {}

export const layerOpencode = Layer.effect(
  Agent,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

    return {
      run: Effect.fn(function* (request: AgentRunOptions) {
        const childProcess = ChildProcess.make("opencode", ["run", request.prompt], {
          cwd: request.cwd,
          stdout: "inherit",
          stderr: "inherit",
          stdin: "inherit",
        })
        const exitCode = yield* spawner
          .exitCode(childProcess)
          .pipe(Effect.mapError((cause) => new AgentError({ cause, message: "" })))

        if (exitCode !== 0) {
          return yield* new AgentError({ message: `Exit code: ${exitCode}`, cause: exitCode })
        }
      }),
    }
  }),
)

export const layerCursorSdkFromEnv = Layer.sync(Agent, () => {
  const apiKey = process.env.CURSOR_API_KEY ?? ""
  const modelId = process.env.CURSOR_MODEL_ID ?? "composer-2"
  const cwd = process.cwd()

  return {
    run: Effect.fn(function* (request: AgentRunOptions) {
      if (apiKey === "") {
        return yield* new AgentError({ message: "CURSOR_API_KEY not set" })
      }

      const agent = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            CursorAgent.create({
              apiKey,
              model: { id: modelId },
              local: { cwd: request.cwd ?? cwd },
            }),
          catch: (cause) => new AgentError({ cause, message: "" }),
        }),
        (agent) => Effect.promise(() => agent[Symbol.asyncDispose]()),
      )

      const run = yield* Effect.tryPromise({
        try: () => agent.send(request.prompt),
        catch: (cause) => new AgentError({ cause, message: "" }),
      })

      if (run.supports("stream")) {
        yield* Effect.tryPromise({
          try: async () => {
            for await (const event of run.stream()) {
              process.stdout.write(
                `${inspect(event, { depth: 8, colors: false, maxArrayLength: 50 })}\n`,
              )
            }
          },
          catch: (cause) => new AgentError({ cause, message: "" }),
        })
      }

      const result = yield* Effect.tryPromise({
        try: () => run.wait(),
        catch: (cause) => new AgentError({ cause, message: "" }),
      })

      if (result.status !== "finished") {
        return yield* new AgentError({
          message: `Run status: ${result.status}`,
          cause: result.status,
        })
      }
    }, Effect.scoped),
  }
})
