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
  | 'DOUBLE'
  | 'BOOLEAN'
  | 'JSON_OBJECT'
  | 'JSON_ARRAY'
  | 'TEXT'
  | 'DATE'

// === Entity metadata =======================================================

/** Metadata stored for each index declared via `PgEntityOptions.indexes`. */
export interface PgIndexMetadata {
  /** list of column names that form the index */
  columns: string[]
  /** whether the index is unique */
  unique: boolean
}

/** Metadata stored on a class by @PgEntity */
export interface PgEntityMetadata {
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
}

/** Metadata stored for each @PgColumn-decorated property */
export interface PgColumnMetadata {
  propertyKey: string
  column: string
  comment: string
  columnType: PgColumnType
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
