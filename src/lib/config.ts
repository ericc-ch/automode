import { Context, Effect, Layer, Path, Schema } from "effect"

export class RunContext extends Schema.TaggedClass<RunContext>()("RunContext", {
  iteration: Schema.Number,
}) {}

export interface Config {
  prompt: (context: RunContext) => string
  shouldContinue: (context: RunContext) => boolean
}

export class WorkflowConfig extends Context.Service<WorkflowConfig>()("automode/WorkflowConfig", {
  make: Effect.gen(function* () {
    const path = yield* Path.Path

    const automodeDir = path.join(process.cwd(), ".automode/")
    yield* Effect.logInfo("automodeDir", automodeDir)

    const load = Effect.fn(function* (workflow: string) {
      yield* Effect.logInfo("Loading workflow config", workflow)
      const workflowDir = path.join(automodeDir, workflow)
      yield* Effect.logInfo("workflowDir", workflowDir)
      const configPath = path.join(workflowDir, "config.ts")
      yield* Effect.logInfo("configPath", configPath)
      const config = yield* Effect.promise(() => import(configPath) as Promise<{ default: Config }>)
      yield* Effect.logInfo("Workflow config loaded", workflow)

      return config.default
    })

    return {
      load,
    }
  }),
}) {
  static readonly layer = Layer.effect(WorkflowConfig, this.make)
}
