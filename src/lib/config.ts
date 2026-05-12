import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect"
import { pathToFileURL } from "node:url"

export const Ctx = Schema.Struct({
  iteration: Schema.mutableKey(Schema.Number),
  cwd: Schema.String,
})

export type CtxType = Schema.Schema.Type<typeof Ctx>

export class ConfigLoadError extends Schema.TaggedErrorClass<ConfigLoadError>()("ConfigLoadError", {
  cause: Schema.Defect,
}) {}

export interface Workflow {
  prompt: () => string
  shouldContinue: () => boolean
}

export const defineConfig = <F extends (ctx: CtxType) => Workflow>(factory: F) => factory

export class WorkflowConfig extends Context.Service<
  WorkflowConfig,
  { readonly ctx: CtxType; readonly handlers: Workflow }
>()("automode/WorkflowConfig") {}

export type WorkflowConfigInput = { readonly cwd: string; readonly name: string }

export const makeContext = (cwd: string) => Schema.decodeUnknownSync(Ctx)({ iteration: 0, cwd })

export const make = (input: WorkflowConfigInput) =>
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

    const ctx = makeContext(input.cwd)
    const raw = yield* Effect.try({
      try: () => factory(ctx),
      catch: (cause) => new ConfigLoadError({ cause }),
    })

    if (typeof raw !== "object" || !raw || typeof raw.prompt !== "function" || typeof raw.shouldContinue !== "function") {
      return yield* new ConfigLoadError({
        cause: new Error("Config factory must return { prompt: () => string, shouldContinue: () => boolean }"),
      })
    }

    const handlers: Workflow = raw as Workflow
    return { ctx, handlers }
  })

export const layer = (input: WorkflowConfigInput) => Layer.effect(WorkflowConfig)(make(input))
