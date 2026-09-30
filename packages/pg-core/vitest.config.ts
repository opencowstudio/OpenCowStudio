import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Restores consola's `info` level (see tests/setup.ts) before any test
    // module creates its tagged logger.
    setupFiles: ['tests/setup.ts'],
  },
})
