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

// Static decorator parser (TypeScript compiler API, builder stage).
export {
  createProgram,
  findEntityClassDeclarations,
  parseClassDecorator,
  parsePropertyDecorators,
  parsePgKey,
  parsePgColumn,
  parseIndexDecorators,
  parsePgEntityRaw,
  parsePgEntities,
} from './builder/parser'
export type {
  ParseProgramOptions,
  ParsedPropertyDecorators,
  LiteralValue,
  EntityClassNode,
} from './builder/parser'

// Entity repository (runtime stage): raw -> validated metadata.
export { resolvePgEntityRaw } from './runtime/repository'

// DataSource (connection-pool routing & multi-database registry).
export { PgDataSource, PgDataSourceManager } from './runtime/datasource'
export type { PoolLike, PoolFactory } from './runtime/datasource'
