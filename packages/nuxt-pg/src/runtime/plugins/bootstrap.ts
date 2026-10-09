import { consola } from 'consola'
import { defineNitroPlugin } from 'nitropack/runtime'
import { PgDataSourceManager, PgRepositoryManager } from '@opencowstudio/pg-core'
import type { PgEntityMetadata } from '@opencowstudio/pg-core'
import { resolvePlaceholders } from '@opencowstudio/core'
import { parsePgConfig } from '../utils/pgConfig'
import { pgConfigJson } from '#pg-manifest'
import { pgEntitiesJson } from '#pg-entities-manifest'

const logger = consola.withTag('nuxt-pg')

export default defineNitroPlugin(async () => {
  if (!pgConfigJson) {
    logger.info('No pg configuration found; skipping datasource initialization.')
    return
  }

  // Resolve `${VAR:default}` placeholders from the environment before parsing,
  // so the build-time config can reference runtime secrets (e.g. `${DB_PASSWORD}`).
  // Required variables without a default (e.g. `${DB_PASSWORD}`) throw when unset.
  let resolved: string
  try {
    resolved = resolvePlaceholders(pgConfigJson)
  } catch (err) {
    logger.error('Failed to resolve placeholders in pg manifest:', err)
    return
  }

  // The build-time manifest carries the `pg` namespace as a formatted JSON
  // string. Parse it back into a plain object, then fault-tolerantly coerce it
  // into the typed metadata consumed by the manager (e.g. string "18" -> 18).
  let raw: unknown
  try {
    raw = JSON.parse(resolved)
  } catch (err) {
    logger.error('Failed to parse pg manifest JSON string:', err)
    return
  }

  const pgConfig = parsePgConfig(raw)
  const manager = new PgDataSourceManager(pgConfig)
  logger.success(
    `PgDataSourceManager initialized (databases: ${manager.dbNames.join(', ') || 'none'})`,
  )

  // The entity manifest carries the scanned entity metadata as a JSON string.
  // A malformed payload must not abort startup, so it is logged and skipped.
  let entities: PgEntityMetadata[]
  try {
    entities = JSON.parse(pgEntitiesJson) as PgEntityMetadata[]
  } catch (err) {
    logger.error('Failed to parse pg entities manifest JSON string:', err)
    return
  }

  // The repository manager resolves each entity's datasource through the
  // manager, so it is built once the datasources exist. Awaited so the schema
  // bootstrap finishes (and its failures surface) before startup continues.
  const repositories = new PgRepositoryManager(manager)
  await repositories.createRepositories(entities)
  logger.success(`PgRepositoryManager initialized (entities: ${entities.length})`)
})
