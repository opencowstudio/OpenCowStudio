import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // NODE_ENV=test drops consola to its `warn` (1) level, which silently
    // swallows every logger.info / logger.debug emitted by the module under
    // test. Raise the level so those diagnostics are visible during `pnpm test`.
    // consola reads CONSOLA_LEVEL when the logger instance is created, which
    // happens at import time — hence it must be set via test.env (before the
    // test module graph is loaded), not from inside a test file.
    env: {
      CONSOLA_LEVEL: '4',
    },
  },
})
