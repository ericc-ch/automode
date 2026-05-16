import type { Config } from "../../src/lib/config.ts"

export default {
  prompt: (ctx) => {
    return `Just say hello`
  },

  shouldContinue: (ctx) => {
    true
  },
} satisfies Config
