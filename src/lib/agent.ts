import { Agent as CursorAgent } from "@cursor/sdk"
import { Context, Data, Effect, Layer } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { inspect } from "node:util"

export type AgentRequest = {
  readonly prompt: string
  readonly cwd?: string
}

export class AgentMissingEnv extends Data.TaggedError("AgentMissingEnv")<{
  readonly name: string
}> {}

export class AgentInternal extends Data.TaggedError("AgentInternal")<{
  readonly cause: unknown
}> {}

export class AgentRunFailed extends Data.TaggedError("AgentRunFailed")<{
  readonly exitCode?: number | undefined
  readonly runId?: string | undefined
  readonly status?: string | undefined
  readonly result?: string | undefined
}> {}

export type AgentError = AgentMissingEnv | AgentInternal | AgentRunFailed

export class Agent extends Context.Service<
  Agent,
  {
    run(request: AgentRequest): Effect.Effect<void, AgentError>
  }
>()("Agent") {}

export type OpencodeAgentOptions = {
  readonly command?: string | undefined
  readonly argsBeforePrompt?: ReadonlyArray<string> | undefined
}

const defaultOpencodeArgs = ["run", "--dangerously-skip-permissions"] as const

export const layerOpencodeWith = (options: OpencodeAgentOptions = {}) => {
  const command = options.command ?? "opencode"
  const argsBeforePrompt = options.argsBeforePrompt ?? defaultOpencodeArgs

  return Layer.effect(
    Agent,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      return {
        run: Effect.fn(function* (request: AgentRequest) {
          const childProcess = ChildProcess.make(command, [...argsBeforePrompt, request.prompt], {
            cwd: request.cwd,
            stdout: "inherit",
            stderr: "inherit",
            stdin: "inherit",
          })
          const exitCode = yield* spawner
            .exitCode(childProcess)
            .pipe(Effect.mapError((cause) => new AgentInternal({ cause })))

          if (exitCode !== 0) {
            return yield* new AgentRunFailed({ exitCode })
          }
        }),
      }
    }),
  )
}

export const layerOpencode = layerOpencodeWith()

export type CursorSdkAgentConfig = {
  readonly apiKey: string
  readonly cwd: string
  readonly modelId: string
}

const makeCursorSdkService = (config: CursorSdkAgentConfig) => ({
  run: (request: AgentRequest) =>
    Effect.gen(function* () {
      if (config.apiKey === "") {
        return yield* new AgentMissingEnv({ name: "CURSOR_API_KEY" })
      }

      const agent = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            CursorAgent.create({
              apiKey: config.apiKey,
              model: { id: config.modelId },
              local: { cwd: request.cwd ?? config.cwd },
            }),
          catch: (cause) => new AgentInternal({ cause }),
        }),
        (agent) => Effect.promise(() => agent[Symbol.asyncDispose]()),
      )

      const run = yield* Effect.tryPromise({
        try: () => agent.send(request.prompt),
        catch: (cause) => new AgentInternal({ cause }),
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
          catch: (cause) => new AgentInternal({ cause }),
        })
      }

      const result = yield* Effect.tryPromise({
        try: () => run.wait(),
        catch: (cause) => new AgentInternal({ cause }),
      })

      if (result.status !== "finished") {
        return yield* new AgentRunFailed({
          runId: result.id,
          status: result.status,
          result: result.result,
        })
      }
    }).pipe(Effect.scoped),
})

export const layerCursorSdk = (config: CursorSdkAgentConfig) =>
  Layer.succeed(Agent, makeCursorSdkService(config))

export const layerCursorSdkFromEnv = Layer.sync(Agent, () =>
  makeCursorSdkService({
    apiKey: process.env.CURSOR_API_KEY ?? "",
    cwd: process.cwd(),
    modelId: process.env.CURSOR_MODEL_ID ?? "composer-2",
  }),
)
