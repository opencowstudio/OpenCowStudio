// ---------------------------------------------------------------------------
// PostgreSQL — barrel exports
// ---------------------------------------------------------------------------

export { PgEntity, PgKey, PgColumn, getPgEntityMetadata, getAllPgEntityMetadata, scanPgEntities } from './decorators'
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

// Configuration (typed YAML loading & URL parsing)
export {
  parsePgUrl,
  toConnectionOptions,
  loadPgConfigFromYaml,
  loadPgConfigFromFile,
} from './config.ts'
export type {
  PgPoolConfig,
  PgNodeConfig,
  PgDatabaseConfig,
  PgDataSourceConfig,
  PgConnectionOptions,
} from './config.ts'

// DataSource (connection-pool routing & multi-database registry)
export { PgDataSource, PgDataSourceManager } from './datasource.ts'
export type { PoolLike, PoolFactory } from './datasource.ts'
