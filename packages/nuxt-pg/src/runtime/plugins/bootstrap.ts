import { consola } from 'consola'
import { defineNitroPlugin } from 'nitropack/runtime'
import { PgDataSourceManager } from '@opencowstudio/pg-core'
import { parsePgConfig } from '../utils/pgConfig'
import { pgConfigJson } from '#pg-manifest'

const logger = consola.withTag('nuxt-pg')

export default defineNitroPlugin(() => {
  if (!pgConfigJson) {
    logger.info('No pg configuration found; skipping datasource initialization.')
    return
  }

  // The build-time manifest carries the `pg` namespace as a formatted JSON
  // string. Parse it back into a plain object, then fault-tolerantly coerce it
  // into the typed metadata consumed by the manager (e.g. string "18" -> 18).
  let raw: unknown
  try {
    raw = JSON.parse(pgConfigJson)
  } catch (err) {
    logger.error('Failed to parse pg manifest JSON string:', err)
    return
  }

  const pgConfig = parsePgConfig(raw)
  const manager = new PgDataSourceManager(pgConfig)
  logger.success(
    `PgDataSourceManager initialized (databases: ${manager.dbNames.join(', ') || 'none'})`,
  )
})
