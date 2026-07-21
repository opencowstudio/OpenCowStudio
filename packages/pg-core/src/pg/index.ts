// ---------------------------------------------------------------------------
// PostgreSQL — barrel exports
// ---------------------------------------------------------------------------

export { PgEntity, PgKey, PgColumn, resolvePgEntities, buildPgEntityRaw, resolvePgEntityRaw } from './decorators'
export type {
  PgEntityOptions,
  PgKeyOptions,
  PgColumnOptions,
  PgColumnType,
  PgIndexOptions,
  PgEntityMetadata,
  PgKeyMetadata,
  PgColumnMetadata,
  BooleanLike,
  PgKeyRaw,
  PgColumnRaw,
  PgEntityRaw,
} from './types.ts'

export type {
  PgPoolMetadata,
  PgNodeMetadata,
  PgDatabaseMetadata,
  PgConfigMetadata,
} from './types.ts'

// DataSource (connection-pool routing & multi-database registry)
export { PgDataSource, PgDataSourceManager } from './datasource.ts'
export type { PoolLike, PoolFactory } from './datasource.ts'
