import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { PgDataSourceManager } from '../pg/datasource.ts'
import type { PgDataSourceConfig } from '../pg/config.ts'

// Lazily-built singleton so every server request shares one set of pools.
let manager: PgDataSourceManager | null = null

/**
 * Return the shared multi-database datasource manager.
 *
 * The manager is constructed once from the server-only runtime config
 * (`runtimeConfig.pg`). Entities resolve their connection via
 * `usePgDataSourceManager().get(entity.dbName)`.
 */
export function usePgDataSourceManager(): PgDataSourceManager {
  if (!manager) {
    const config = useRuntimeConfig().pg as unknown as PgDataSourceConfig
    manager = new PgDataSourceManager(config)
  }
  return manager
}

export default defineNitroPlugin(() => {
  // Build the pools eagerly at server start so connection errors surface early.
  usePgDataSourceManager()
})
