// ---------------------------------------------------------------------------
// PostgreSQL metadata — type definitions
//
// This module holds the metadata type definitions produced by the builder
// parser (`builder/parser.ts`), plus the datasource configuration metadata:
//
//   * Entity metadata    — `PgEntityMetadata` / `PgKeyMetadata` /
//     `PgColumnMetadata` / `PgIndexMetadata`: the validated, defaulted and
//     normalised form produced by `parsePgEntity` / `parsePgEntities`.
//
//   * Configuration metadata (`PgConfigMetadata`, …) describes the datasource
//     definition and is independent of the entity pipeline.
//
// The decorator *option* types (`PgEntityOptions`, …) live in
// `builder/decorators.ts`; the shared `PgColumnType` primitive is defined here
// and re-imported by that module (type-only).
// ---------------------------------------------------------------------------

// === Column primitives =====================================================

/** Logical SQL column types. */
export type PgColumnType =
  | 'BIGINT'
  | 'INT'
  | 'DOUBLE'
  | 'BOOLEAN'
  | 'JSON_OBJECT'
  | 'JSON_ARRAY'
  | 'TEXT'
  | 'DATE'

/**
 * Normalised default value of a column, resolved by the builder from
 * `PgColumnOptions.default`.
 *
 * A declared value is converted to the column's logical type — `number` for
 * the numeric types, `boolean` for `BOOLEAN`, the parsed JSON value for the
 * JSON types — while `TEXT` keeps the string. `DATE` is fixed to `null`, and the
 * JSON types fall back to `null` when the option is omitted; otherwise the
 * column falls back to its type's zero value (`0` / `false` / `''`).
 */
export type PgColumnDefault = unknown

// === Entity metadata =======================================================

/** Metadata stored for each index declared via `PgEntityOptions.indexes`. */
export interface PgIndexMetadata {
  /** list of column names that form the index (resolved snake_case names) */
  columns: string[]
  /** whether the index is unique */
  unique: boolean
  /** whether the index uses the GIN access method */
  gin: boolean
}

/** Metadata stored on a class by @PgEntity */
export interface PgEntityMetadata {
  /** the entity class name, as declared in its source file (e.g. `User`) */
  className: string
  /**
   * Path of the module declaring the entity, as addressed by `import.meta.glob`
   * at runtime. The exact form is decided by the caller resolving it — the Nuxt
   * module records it relative to the project root with a leading `/` (e.g.
   * `/server/entities/user.ts`) — so the runtime can load the class through
   * `(await modules[modulePath]())[className]`.
   */
  modulePath: string
  dbName: string
  schema: string
  table: string
  comment: string
  createTableAuto: boolean
  addColumnAuto: boolean
  createIndexAuto: boolean
  indexes: PgIndexMetadata[]
  /** the single primary/unique key declared on the class (exactly one @PgKey required) */
  key: PgKeyMetadata
  columns: PgColumnMetadata[]
}

/** Metadata stored for each @PgKey-decorated property */
export interface PgKeyMetadata {
  propertyKey: string
  column: string
  generated: boolean
  comment: string
  columnType: PgColumnType
}

/** Metadata stored for each @PgColumn-decorated property */
export interface PgColumnMetadata {
  propertyKey: string
  column: string
  comment: string
  columnType: PgColumnType
  /** normalised default value, resolved from PgColumnOptions.default */
  default: PgColumnDefault
}

// === Configuration metadata =================================================

// A project defines its PostgreSQL datasource configuration *in code* as a
// `PgConfigMetadata` object. The metadata describes one shared pool and one or
// more databases. Each database is keyed by `dbName` and owns a master node
// plus an optional list of read-replica (slave) nodes. The entity decorator's
// `dbName` option maps directly to these keys.

/** Shared connection-pool tuning applied to every node. */
export interface PgPoolMetadata {
  /** maximum number of clients in the pool */
  max: number
  /** minimum number of clients kept alive in the pool */
  min: number
  /** idle timeout of a client before it is closed (milliseconds) */
  idleTimeoutMillis: number
  /** maximum lifetime of a client before it is recycled (seconds) */
  maxLifetimeSeconds: number
}

/** A single PostgreSQL node (master or slave): a standard URL + credentials. */
export interface PgNodeMetadata {
  /** standard PostgreSQL URL, e.g. postgresql://host:port/db */
  url: string
  username: string
  password: string
}

/** One database: a master plus an optional list of read replicas. */
export interface PgDatabaseMetadata {
  master: PgNodeMetadata
  slaves: PgNodeMetadata[]
}

/** Top-level datasource configuration metadata defined in code. */
export interface PgConfigMetadata {
  pool: PgPoolMetadata
  databases: Record<string, PgDatabaseMetadata>
}
