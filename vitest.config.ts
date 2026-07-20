import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@lp-mine/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@lp-mine/robinhood-univ3': fileURLToPath(new URL('./packages/robinhood-univ3/src/index.ts', import.meta.url)),
    },
  },
})
