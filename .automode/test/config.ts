import type { Config } from "../../src/lib/config.ts"

export default {
  prompt: (ctx) => {
    return `Just say hello`
  },

  shouldContinue: (ctx) => {
    return ctx.iteration > 1 ? false : true
  },
} satisfies Config
