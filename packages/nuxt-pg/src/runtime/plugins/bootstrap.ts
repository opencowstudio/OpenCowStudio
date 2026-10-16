import { consola } from 'consola'
import { defineNitroPlugin } from 'nitropack/runtime'
import { PgDataSourceManager, PgRepositoryManager } from '@opencowstudio/pg-core'
import type { PgConfigMetadata } from '@opencowstudio/pg-core'
import { resolvePgConfigPlaceholders } from '../utils/env-placeholder'
import { pgConfigMetadata } from '#pg-manifest'
import { pgEntitiesMetadata } from '#pg-entities-manifest'

const logger = consola.withTag('nuxt-pg')

export default defineNitroPlugin(async () => {
  if (!pgConfigMetadata) {
    logger.info('No pg configuration found; skipping datasource initialization.')
    return
  }

  // The build-time manifest carries the typed metadata. Resolve `${VAR:default}`
  // placeholders from the environment, so the build-time config can reference
  // runtime secrets (e.g. `${DB_PASSWORD}`). Required variables without a
  // default (e.g. `${DB_PASSWORD}`) throw when unset.
  let pgConfig: PgConfigMetadata
  try {
    pgConfig = resolvePgConfigPlaceholders(pgConfigMetadata)
  } catch (err) {
    logger.error('Failed to resolve placeholders in pg config:', err)
    return
  }

  const manager = new PgDataSourceManager(pgConfig)
  logger.success(
    `PgDataSourceManager initialized (databases: ${manager.dbNames.join(', ') || 'none'})`,
  )

  // Run the per-database initialization SQL (extensions & bookkeeping tables)
  // on every datasource before the repositories are built.
  await manager.initializeSql()

  // The entity manifest carries the scanned entity metadata directly. The
  // repository manager resolves each entity's datasource through the manager,
  // so it is built once the datasources exist. Awaited so the schema bootstrap
  // finishes (and its failures surface) before startup continues.
  const repositories = new PgRepositoryManager(manager)
  await repositories.createRepositories(pgEntitiesMetadata)
  logger.success(`PgRepositoryManager initialized (entities: ${pgEntitiesMetadata.length})`)
})
