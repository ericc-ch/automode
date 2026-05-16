#!/usr/bin/env node

import { Console, Effect, FileSystem, Path } from "effect"
import { Argument, Command } from "effect/unstable/cli"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { fileURLToPath } from "node:url"

const templatePath = fileURLToPath(new URL("./templates/config.ts.txt", import.meta.url))

const workflow = Argument.string("workflow")

const initCommand = Command.make(
  "init",
  { workflow },
  Effect.fn(function* ({ workflow }) {
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

const command = Command.make("automode", {}).pipe(
  Command.withDescription("Orchestrate coding agents in a loop"),
  Command.withSubcommands([initCommand]),
)

const cli = Command.run(command, { version: "0.0.1" })

NodeRuntime.runMain(cli.pipe(Effect.provide(NodeServices.layer)))
