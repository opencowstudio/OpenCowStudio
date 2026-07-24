// ---------------------------------------------------------------------------
// PostgreSQL metadata — type definitions
//
// This module holds ONLY type definitions for pg-core, split into two stages:
//
//   * Raw parse products  — `PgEntityRaw` / `PgKeyRaw` / `PgColumnRaw` /
//     `PgIndexRaw`: the *unmodified* decorator input captured by the builder
//     parser (`builder/parser.ts`) for a single entity class. No defaults are
//     applied, no identifiers validated, no BooleanLike strings normalised.
//
//   * Runtime metadata    — `PgEntityMetadata` / `PgKeyMetadata` /
//     `PgColumnMetadata` / `PgIndexMetadata`: the validated, defaulted and
//     normalised form produced by `runtime/repository.ts`.
//
// The decorator *option* types (`PgEntityOptions`, …) and the shared
// `BooleanLike` / `PgColumnType` primitives live in `decorators.ts` and are
// re-imported here so the raw/metadata shapes can reference them.
//
// Configuration metadata (`PgConfigMetadata`, …) describes the datasource
// definition and is independent of the entity pipeline.
// ---------------------------------------------------------------------------

import type {
  PgColumnType,
  PgColumnOptions,
  PgEntityOptions,
  PgIndexOptions,
  PgKeyOptions,
} from './decorators.ts'

// === Raw parse products ====================================================

/** Raw decorator input for a single @PgKey-decorated field. */
export interface PgKeyRaw {
  /** the property name on the class (as declared in the decorator context) */
  propertyKey: string | symbol
  /** the original, unmodified options passed to @PgKey */
  options: PgKeyOptions
}

/** Raw decorator input for a single @PgColumn-decorated field. */
export interface PgColumnRaw {
  /** the property name on the class (as declared in the decorator context) */
  propertyKey: string | symbol
  /** the original, unmodified options passed to @PgColumn */
  options: PgColumnOptions
}

/** Raw decorator input for a single @PgIndex-decorated class. */
export interface PgIndexRaw {
  /** the original, unmodified options passed to @PgIndex */
  options: PgIndexOptions
}

/** Raw decorator input for a single @PgEntity-decorated class. */
export interface PgEntityRaw {
  /** the class name (used to derive the default table name) */
  className: string
  /** the original, unmodified options passed to @PgEntity */
  options: PgEntityOptions
  /** the single key field declared on the class (exactly one @PgKey required) */
  key: PgKeyRaw
  /** the column fields declared on the class (one entry per @PgColumn) */
  columns: PgColumnRaw[]
  /** the index definitions declared via @PgIndex on the class */
  indexes: PgIndexRaw[]
}

// === Runtime metadata ======================================================

/** Metadata stored for each @PgIndex definition. */
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
