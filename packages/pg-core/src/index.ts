// @opencowstudio/pg-core — framework-agnostic PostgreSQL ORM core.
//
// Public runtime entry: re-exports the shared contract (`shared/`), the runtime
// implementation (`runtime/`) and the decorator markers
// (`builder/decorators.ts`). That one file is the ONLY thing it may reach inside
// `builder/` — never `builder/parser.ts`, which is build-time only and pulls in
// the TypeScript compiler API.
//
// Layering — dependencies flow one way only: `builder/ -> shared/ <- runtime/`.
//   * shared/  : the cross-layer contract — metadata types + naming helpers
//                (no `typescript`, no `pg`)
//   * builder/ : decorator markers + build-time parsing
//   * runtime/ : runtime implementation (may import `pg`)
//
// This package has no dependency on Nuxt so it can be used in any Node.js
// environment.

// === builder — decorator markers ===========================================

// Entity decorators (static markers). Value-level only; free of `typescript`.
export { PgEntity, PgKey, PgColumn } from './builder/decorators'
export type {
  PgEntityOptions,
  PgKeyOptions,
  PgColumnOptions,
  PgIndexOptions,
} from './builder/decorators'

// === shared — the metadata type contract ===================================

// Column primitives, entity metadata and configuration metadata types.
export type {
  ColumnDefault,
  ColumnMetadata,
  ColumnType,
  EntityMetadata,
  IndexMetadata,
  KeyMetadata,
  PgConfigMetadata,
  PgDatabaseMetadata,
  PgNodeMetadata,
  PgPoolMetadata,
} from './shared/types.ts'

// === runtime ===============================================================

// Entity operation contract (CRUD + paging), the page a paged read returns,
// plus the class/type-map shapes the repository registry is keyed by.
export type {
  PageResult,
  PgEntityClass,
  PgEntityRepository,
  PgEntityTypeMap,
} from './runtime/repository'

// Repository registry (one repository per scanned entity), plus the read-side
// service that resolves a repository from its entity class.
export { PgRepositories, PgRepositoryManager } from './runtime/repository'

// Filter conditions (`WHERE` terms): equality, set membership, range, string
// matching and boolean grouping, plus the factory functions that create them.
export type {
  FilterCondition,
  PgBoolFilter,
  PgBoolFilterInput,
  PgEqualsFilter,
  PgInFilter,
  PgInValue,
  PgInValues,
  PgMatchFilter,
  PgRangeFilter,
  PgRangeInput,
  PgRangeValue,
} from './runtime/filter'
export {
  BoolFilterBuilder,
  EqualsFilterBuilder,
  FilterBuilder,
  InFilterBuilder,
  MatchFilterBuilder,
  RangeFilterBuilder,
} from './runtime/filter'

// Sort conditions (`ORDER BY` terms): a single-column sort and a multi-column
// sort, plus the factory functions that create them.
export type {
  PgColumnSort,
  PgMultiColumnSort,
  PgSortOrder,
  SortCondition,
} from './runtime/sort'
export { ColumnSortBuilder, MultiColumnSortBuilder, SortBuilder } from './runtime/sort'

// Column introspection types (catalog rows + the divergences detected against
// the entity metadata), owned by the storage bootstrap.
export type {
  PgColumnDefinition,
  PgColumnMismatch,
  PgColumnMismatchKind,
} from './runtime/schema-sync'

// SQL template catalogue (catalog introspection statements), plus the
// statement + values pair a builder returns.
export type { PgSqlQuery, SelectOptions } from './runtime/sql'
export { DEFAULT_SCHEMA, PgSqlTemplate } from './runtime/sql'

// DataSource (connection-pool routing & multi-database registry).
export { PgDataSource, PgDataSourceManager } from './runtime/datasource'
