// ---------------------------------------------------------------------------
// PostgreSQL — barrel exports
// ---------------------------------------------------------------------------

export { PgEntity, PgKey, PgColumn, resolvePgEntities } from './decorators'
export type {
  PgEntityOptions,
  PgKeyOptions,
  PgColumnOptions,
  PgColumnType,
  PgIndexOptions,
  PgEntityMetadata,
  PgKeyMetadata,
  PgColumnMetadata,
} from './types.ts'

// Configuration (typed metadata definition & URL parsing)
export {
  parsePgUrl,
  toConnectionOptions,
  definePgConfig,
} from './config.ts'
export type {
  PgPoolConfig,
  PgNodeConfig,
  PgDatabaseConfig,
  PgConfigMetadata,
  PgConnectionOptions,
} from './config.ts'

// DataSource (connection-pool routing & multi-database registry)
export { PgDataSource, PgDataSourceManager } from './datasource.ts'
export type { PoolLike, PoolFactory } from './datasource.ts'
