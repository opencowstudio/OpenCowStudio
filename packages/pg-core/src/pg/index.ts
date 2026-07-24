// ---------------------------------------------------------------------------
// PostgreSQL — barrel exports
// ---------------------------------------------------------------------------

// Entity decorators (static markers) + their option types.
export { PgEntity, PgKey, PgColumn, PgIndex } from './decorators'
export type {
  PgEntityOptions,
  PgKeyOptions,
  PgColumnOptions,
  PgIndexOptions,
  PgColumnType,
  BooleanLike,
} from './decorators'

// Raw parse products, runtime metadata, and configuration metadata types.
export type {
  PgEntityRaw,
  PgKeyRaw,
  PgColumnRaw,
  PgIndexRaw,
  PgEntityMetadata,
  PgKeyMetadata,
  PgColumnMetadata,
  PgIndexMetadata,
  PgPoolMetadata,
  PgNodeMetadata,
  PgDatabaseMetadata,
  PgConfigMetadata,
} from './types.ts'

// Entity repository (runtime stage): raw -> validated metadata.
export { resolvePgEntityRaw } from './runtime/repository'

// DataSource (connection-pool routing & multi-database registry).
export { PgDataSource, PgDataSourceManager } from './runtime/datasource'
export type { PoolLike, PoolFactory } from './runtime/datasource'
