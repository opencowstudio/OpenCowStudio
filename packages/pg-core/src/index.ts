// @opencowstudio/pg-core — framework-agnostic PostgreSQL ORM core.
//
// Public runtime entry: re-exports the shared contract (`shared/`), the runtime
// implementation (`runtime/`) and the decorator markers
// (`builder/decorators.ts`). That one file is the ONLY thing it may reach inside
// `builder/` — never `builder/parser.ts`, which is build-time only and pulls in
// the TypeScript compiler API.
//
// Layering — dependencies flow one way only: `builder/ -> shared/ <- runtime/`.
//   * shared/  : the pure type contract (no `typescript`, no `pg`)
//   * builder/ : decorator markers + build-time parsing
//   * runtime/ : runtime implementation (may import `pg`)
//
// This package has no dependency on Nuxt so it can be used in any Node.js
// environment.

// === builder — decorator markers ===========================================

// Entity decorators (static markers). Value-level only; free of `typescript`.
export { PgEntity, PgKey, PgColumn, PgIndex } from './builder/decorators'
export type {
  BooleanLike,
  PgColumnType,
  PgEntityOptions,
  PgKeyOptions,
  PgColumnOptions,
  PgIndexOptions,
} from './builder/decorators'

// === shared — the metadata type contract ===================================

// Entity metadata and configuration metadata types.
export type {
  PgEntityMetadata,
  PgKeyMetadata,
  PgColumnMetadata,
  PgIndexMetadata,
  PgPoolMetadata,
  PgNodeMetadata,
  PgDatabaseMetadata,
  PgConfigMetadata,
} from './shared/types.ts'

// === runtime ===============================================================

// Entity operation contract (CRUD).
export type { PgEntityRepository } from './runtime/repository'

// SQL template catalogue (catalog introspection statements).
export { DEFAULT_SCHEMA, PgSqlTemplate } from './runtime/sql'

// DataSource (connection-pool routing & multi-database registry).
export { PgDataSource, PgDataSourceManager } from './runtime/datasource'
