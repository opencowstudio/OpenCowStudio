import { consola } from 'consola'
import { defineNitroPlugin } from 'nitropack/runtime'
import { PgDataSourceManager } from '@opencowstudio/pg-core'
import { pgConfig } from '#pg-manifest'

const logger = consola.withTag('nuxt-pg')

export default defineNitroPlugin(() => {
  if (!pgConfig) {
    logger.info('No pg configuration found; skipping datasource initialization.')
    return
  }

  const manager = new PgDataSourceManager(pgConfig)
  logger.success(
    `PgDataSourceManager initialized (databases: ${manager.dbNames.join(', ') || 'none'})`,
  )
})
