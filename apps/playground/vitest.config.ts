import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {},
  resolve: {
    alias: {
      '~': resolve(__dirname),
    },
  },
})
