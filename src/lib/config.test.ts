import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { WorkflowConfig, makeContext } from "./config.ts"

describe("WorkflowConfig", () => {
  it("makeContext builds initial ctx", () => {
    const ctx = makeContext("/tmp/foo")
    expect(ctx.cwd).toBe("/tmp/foo")
    expect(ctx.iteration).toBe(0)
  })

  it("layer provides WorkflowConfig", async () => {
    const ctx = makeContext("/x")
    const handlers = { prompt: () => "hi", shouldContinue: () => false }
    const testLayer = Layer.succeed(WorkflowConfig)({ ctx, handlers })
    const program = Effect.gen(function* () {
      const c = yield* WorkflowConfig
      return c.handlers.prompt()
    })
    await expect(Effect.runPromise(Effect.provide(program, testLayer))).resolves.toBe("hi")
  })
})
