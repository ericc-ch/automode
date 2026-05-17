import { Effect, Layer } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { CodingAgent, type SessionRequest } from "./coding-agent.ts"

export type OpencodeCliCodingAgentOptions = {
  /** Executable name or path; default `"opencode"`. */
  readonly command?: string | undefined
  /**
   * Arguments inserted before the prompt (which is passed as the final argv entry),
   * default `["run", "--dangerously-skip-permissions"]` to mirror the current runner.
   */
  readonly argsBeforePrompt?: ReadonlyArray<string> | undefined
}

const defaultArgsBeforePrompt = ["run", "--dangerously-skip-permissions"] as const

/**
 * Runs `opencode` as a child process with inherited stdio so OpenCode owns the terminal UI.
 */
export const layerOpencodeCli = (options: OpencodeCliCodingAgentOptions = {}) => {
  const command = options.command ?? "opencode"
  const argsBeforePrompt = options.argsBeforePrompt ?? defaultArgsBeforePrompt

  return Layer.succeed(CodingAgent, {
    runSession: Effect.fn(function* (request: SessionRequest) {
      const argv = [...argsBeforePrompt, request.prompt]
      const cmd = ChildProcess.make(command, argv, {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
      })
      const handle = yield* cmd
      const exitCode = yield* handle.exitCode
      return { exitCode: exitCode as number }
    }),
  })
}
