import { Context, Effect } from "effect"

export class Agent extends Context.Service<
  Agent,
  {
    run(request: { prompt: string; cwd?: string }): Effect.Effect<void>
  }
>()("Agent") {}
