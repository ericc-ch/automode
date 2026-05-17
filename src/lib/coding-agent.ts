import { Context, Data, Effect, Scope } from "effect"
import { PlatformError } from "effect/PlatformError"
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

/** One automode session: prompt text for the agent backend. */
export type SessionRequest = {
  readonly prompt: string
}

/** Outcome after the backend considers that session finished (process exit or SDK run result). */
export type SessionOutcome = {
  readonly exitCode: number
  readonly runId?: string
  readonly runStatus?: string
  readonly resultText?: string
}

export type CodingAgentError = CodingAgentMissingEnv | CodingAgentInternal | PlatformError

/**
 * One session execution: success value, unified agent errors, plus child-process scope
 * (OpenCode) or nothing extra (Cursor acquires its own scope per call).
 */
export type CodingAgentRun = Effect.Effect<
  SessionOutcome,
  CodingAgentError,
  Scope.Scope | ChildProcessSpawner
>

/**
 * Pluggable coding agent. Each implementation owns user-visible output (for example
 * inherited stdio for OpenCode CLI, or printing SDK stream events for Cursor).
 */
export type CodingAgentApi = {
  readonly runSession: (request: SessionRequest) => CodingAgentRun
}

export const CodingAgent = Context.Service<CodingAgentApi>("automode/CodingAgent")

export class CodingAgentMissingEnv extends Data.TaggedError("CodingAgentMissingEnv")<{
  readonly name: string
}> {}

export class CodingAgentInternal extends Data.TaggedError("CodingAgentInternal")<{
  readonly cause: unknown
}> {}
