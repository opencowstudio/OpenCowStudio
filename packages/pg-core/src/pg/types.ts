// ---------------------------------------------------------------------------
// PostgreSQL metadata — type definitions
//
// This module holds ONLY type definitions for every piece of PostgreSQL
// metadata used by pg-core:
//
//   * Decorator metadata — captured on entity classes by the @PgEntity /
//     @PgKey / @PgColumn decorators (PgEntityMetadata, PgKeyMetadata, ...).
//   * Configuration metadata — the datasource definition (pool / node /
//     database) supplied as a `PgConfigMetadata` object.
//
// All runtime logic (URL parsing, datasource creation)
// lives in `datasource.ts`.
// ---------------------------------------------------------------------------

// === Decorator metadata =====================================================

/** Options for @PgKey decorator */
export interface PgKeyOptions {
  /** column name in database, default '' (derived from property name) */
  column?: string
  /** whether the key is auto-generated (e.g. SERIAL / GENERATED ALWAYS), default true */
  generated?: boolean
  /** column comment, default '' */
  comment?: string
}

/** Options for @PgColumn decorator */
export interface PgColumnOptions {
  /** column name in database, default '' (derived from property name) */
  column?: string
  /** column comment, default '' */
  comment?: string
  /** logical SQL column type; must be declared on every column field */
  columnType?: PgColumnType
}

/** Logical SQL column types. */
export type PgColumnType =
  | 'BIGINT'
  | 'DOUBLE'
  | 'BOOLEAN'
  | 'JSON_OBJECT'
  | 'JSON_ARRAY'
  | 'TEXT'
  | 'DATE'

/** Options for @PgIndex decorator (used inside @PgEntity indexes array) */
export interface PgIndexOptions {
  /** list of column names that form the index */
  columns: string[]
  /** whether the index is unique, default false */
  unique?: boolean
}

/** Metadata stored for each index (used inside PgEntityMetadata indexes array) */
export interface PgIndexMetadata {
  /** list of column names that form the index */
  columns: string[]
  /** whether the index is unique */
  unique: boolean
}

/** Options for @PgEntity decorator */
export interface PgEntityOptions {
  /** automatically create the table if it does not exist, default true */
  createTableAuto?: boolean
  /** automatically add new columns not present in the database, default true */
  addColumnAuto?: boolean
  /** automatically create indexes defined in `indexes`, default true */
  createIndexAuto?: boolean
  /** database name, default '' (uses default connection db) */
  dbName?: string
  /** schema name, default 'public' */
  schema?: string
  /** table name in database, default snake_case of the class name */
  table?: string
  /** table comment, default '' */
  comment?: string
  /** list of index definitions to create, default [] */
  indexes?: PgIndexOptions[]
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
  keys: PgKeyMetadata[]
  columns: PgColumnMetadata[]
}

/** Metadata stored for each @PgKey-decorated property */
export interface PgKeyMetadata {
  propertyKey: string | symbol
  column: string
  generated: boolean
  comment: string
}

/** Metadata stored for each @PgColumn-decorated property */
export interface PgColumnMetadata {
  propertyKey: string | symbol
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
