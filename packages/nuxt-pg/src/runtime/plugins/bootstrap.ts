import { consola } from 'consola'
import { defineNitroPlugin } from 'nitropack/runtime'
import { PgDataSourceManager } from '@opencowstudio/pg-core'
import type { PgConfigMetadata } from '@opencowstudio/pg-core'
import { pgConfigJson } from '#pg-manifest'

const logger = consola.withTag('nuxt-pg')

export default defineNitroPlugin(() => {
  if (!pgConfigJson) {
    logger.info('No pg configuration found; skipping datasource initialization.')
    return
  }

  // The build-time manifest carries the `pg` namespace as a formatted JSON
  // string; parse it back into the typed metadata consumed by the manager.
  const pgConfig = JSON.parse(pgConfigJson) as PgConfigMetadata
  const manager = new PgDataSourceManager(pgConfig)
  logger.success(
    `PgDataSourceManager initialized (databases: ${manager.dbNames.join(', ') || 'none'})`,
  )
})
