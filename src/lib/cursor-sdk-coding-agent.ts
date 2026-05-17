import { Agent } from "@cursor/sdk"
import { Effect, Layer } from "effect"
import { inspect } from "node:util"
import {
  CodingAgent,
  CodingAgentInternal,
  CodingAgentMissingEnv,
  type CodingAgentApi,
  type SessionRequest,
} from "./coding-agent.ts"

export type CursorSdkCodingAgentConfig = {
  readonly apiKey: string
  readonly cwd: string
  readonly modelId: string
}

const makeApi = (config: CursorSdkCodingAgentConfig): CodingAgentApi => ({
  runSession: (request: SessionRequest) =>
    Effect.gen(function* () {
      if (config.apiKey === "") {
        return yield* new CodingAgentMissingEnv({ name: "CURSOR_API_KEY" })
      }

      return yield* Effect.scoped(
        Effect.gen(function* () {
          const agent = yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () =>
                Agent.create({
                  apiKey: config.apiKey,
                  model: { id: config.modelId },
                  local: { cwd: config.cwd },
                }),
              catch: (cause) => new CodingAgentInternal({ cause }),
            }),
            (a) => Effect.promise(() => a[Symbol.asyncDispose]()),
          )

          const run = yield* Effect.tryPromise({
            try: () => agent.send(request.prompt),
            catch: (cause) => new CodingAgentInternal({ cause }),
          })

          yield* Effect.tryPromise({
            try: async () => {
              for await (const event of run.stream()) {
                process.stdout.write(
                  `${inspect(event, { depth: 8, colors: false, maxArrayLength: 50 })}\n`,
                )
              }
            },
            catch: (cause) => new CodingAgentInternal({ cause }),
          })

          const result = yield* Effect.tryPromise({
            try: () => run.wait(),
            catch: (cause) => new CodingAgentInternal({ cause }),
          })

          return {
            exitCode: result.status === "finished" ? 0 : 1,
            runId: result.id,
            runStatus: result.status,
            ...(result.result !== undefined ? { resultText: result.result } : {}),
          }
        }),
      )
    }),
})

/**
 * Cursor SDK backend: prints each `SDKMessage` with `util.inspect` on stdout, then maps
 * `run.wait()` into {@link SessionOutcome}. One short-lived agent per session (matches a
 * fresh `opencode run` subprocess each time).
 */
export const layerCursorSdk = (config: CursorSdkCodingAgentConfig) =>
  Layer.succeed(CodingAgent, makeApi(config))

/**
 * Builds config from `process.env` (`CURSOR_API_KEY`, optional `CURSOR_MODEL_ID`) and `process.cwd()`.
 * Empty `CURSOR_API_KEY` is only rejected inside `runSession` so the layer can still be composed.
 */
export const layerCursorSdkFromEnv = Layer.sync(CodingAgent, () =>
  makeApi({
    apiKey: process.env.CURSOR_API_KEY ?? "",
    cwd: process.cwd(),
    modelId: process.env.CURSOR_MODEL_ID ?? "composer-2",
  }),
)
