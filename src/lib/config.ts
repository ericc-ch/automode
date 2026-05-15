import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect"
import { pathToFileURL } from "node:url"

export class RunContext extends Schema.TaggedClass<RunContext>()("RunContext", {
  iteration: Schema.Number,
  cwd: Schema.String,
}) {}

export class ConfigLoadError extends Schema.TaggedErrorClass<ConfigLoadError>()("ConfigLoadError", {
  cause: Schema.Defect,
}) {}

export interface Config {
  prompt: (context: RunContext) => string
  shouldContinue: (context: RunContext) => boolean
}

export type WorkflowConfigInput = { readonly cwd: string; readonly name: string }

export class WorkflowConfig extends Context.Service<WorkflowConfig>()("automode/WorkflowConfig", {
  make: (input: WorkflowConfigInput) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const fs = yield* FileSystem.FileSystem

      const configPath = path.join(input.cwd, ".automode", input.name, "config.ts")
      const exists = yield* fs.exists(configPath)
      if (!exists) {
        return yield* new ConfigLoadError({
          cause: new Error(`Config not found: ${configPath}`),
        })
      }

      const href = pathToFileURL(configPath).href
      const imported = yield* Effect.tryPromise({
        try: () => import(href) as Promise<{ default: unknown }>,
        catch: (cause) => new ConfigLoadError({ cause }),
      })

      const factory = imported.default
      if (typeof factory !== "function") {
        return yield* new ConfigLoadError({
          cause: new Error("Config must default-export a function (defineConfig factory)"),
        })
      }

      const ctx = Schema.decodeUnknownSync(RunContext)({ iteration: 0, cwd: input.cwd })
      const raw = yield* Effect.try({
        try: () => factory(ctx),
        catch: (cause) => new ConfigLoadError({ cause }),
      })

      if (
        typeof raw !== "object" ||
        !raw ||
        typeof raw.prompt !== "function" ||
        typeof raw.shouldContinue !== "function"
      ) {
        return yield* new ConfigLoadError({
          cause: new Error(
            "Config factory must return { prompt: () => string, shouldContinue: () => boolean }",
          ),
        })
      }

      const handlers: Config = raw as Config
      return { ctx, handlers }
    }),
}) {
  static readonly layer = (input: WorkflowConfigInput) =>
    Layer.effect(WorkflowConfig, this.make(input))
}

export const makeContext = (cwd: string) =>
  Schema.decodeUnknownSync(RunContext)({ iteration: 0, cwd })
