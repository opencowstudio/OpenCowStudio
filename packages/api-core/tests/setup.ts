import { LogLevels, consola } from 'consola'

// consola lowers its default level to `warn` when NODE_ENV is "test" (vitest
// sets it), which hides every `info` / `success` line the runtime emits.
// Restore the production default here so those logs stay visible while running
// the suite — unless CONSOLA_LEVEL already asked for something else.
if (!process.env.CONSOLA_LEVEL) {
  consola.level = LogLevels.info
}
