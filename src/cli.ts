#!/usr/bin/env node

import { Console, Effect, FileSystem, Layer, Path } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { fileURLToPath } from "node:url"
import { WorkflowConfig, RunContext } from "./lib/config.ts"
import { Agent, layerOpencode, layerCursorSdkFromEnv } from "./lib/agent.ts"

const templatePath = fileURLToPath(new URL("./templates/config.ts.txt", import.meta.url))

const agentFlag = Flag.string("agent").pipe(
  Flag.withAlias("a"),
  Flag.withDefault("opencode"),
)

const initCommand = Command.make(
  "init",
  { workflow: Argument.string("workflow") },
  Effect.fnUntraced(function* ({ workflow }) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const dir = path.join(".automode", workflow)
    const configFile = path.join(dir, "config.ts")

    yield* fs.makeDirectory(dir, { recursive: true })

    const template = yield* fs.readFileString(templatePath)
    yield* fs.writeFileString(configFile, template)

    yield* Console.log(`Created ${configFile}`)
  }),
).pipe(
  Command.withDescription("Scaffold a new workflow"),
  Command.withExamples([
    { command: "automode init my-workflow", description: "Create .automode/my-workflow/config.ts" },
  ]),
)

const runCommand = Command.make(
  "run",
  {
    workflow: Argument.string("workflow"),
    agent: agentFlag,
  },
  Effect.fnUntraced(function* ({ workflow }) {
    yield* Effect.logInfo(`Starting workflow: ${workflow}`)

    const config = yield* WorkflowConfig
    const workflowConfig = yield* config.load(workflow)
    yield* Effect.logInfo(`Loaded workflow: ${workflow}`)

    const agent = yield* Agent
    let ctx = new RunContext({ iteration: 1 })

    while (workflowConfig.shouldContinue(ctx)) {
      yield* Effect.logInfo(`Iteration ${ctx.iteration} starting`)

      const promptText = workflowConfig.prompt(ctx)
      yield* Effect.logInfo(`Prompt: ${promptText.substring(0, 100)}...`)

      yield* agent.run({ prompt: promptText })

      yield* Effect.logInfo(`Iteration ${ctx.iteration} completed`)

      ctx = new RunContext({ iteration: ctx.iteration + 1 })
    }

    yield* Effect.logInfo("Workflow completed")
  }),
).pipe(
  Command.withDescription("Run a workflow loop"),
  Command.withExamples([
    { command: "automode run my-workflow", description: "Run with opencode (default)" },
    { command: "automode run my-workflow --agent cursor", description: "Run with cursor" },
  ]),
  Command.provide(({ agent }) =>
    agent === "cursor" ? layerCursorSdkFromEnv : layerOpencode
  ),
)

const command = Command.make("automode", {}).pipe(
  Command.withDescription("Orchestrate coding agents in a loop"),
  Command.withSubcommands([initCommand, runCommand]),
)

const cli = Command.run(command, { version: "0.0.1" })

const baseLayers = Layer.empty.pipe(
  Layer.merge(WorkflowConfig.layer),
  Layer.provideMerge(NodeServices.layer),
)

NodeRuntime.runMain(cli.pipe(Effect.provide(baseLayers)))
