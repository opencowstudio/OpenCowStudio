// ---------------------------------------------------------------------------
// PostgreSQL metadata — type definitions
//
// This module holds ONLY type definitions for pg-core: the shared option
// primitives, the decorator option types, and the two-stage entity metadata.
//
//   * Shared primitives  — `BooleanLike` / `PgColumnType`: the value shapes the
//     decorator options accept.
//
//   * Decorator options  — `PgEntityOptions` / `PgKeyOptions` /
//     `PgColumnOptions` / `PgIndexOptions`: what the decorators accept. The
//     decorator *functions* live in `decorators.ts` and import these
//     (type-only), so the dependency stays one-way.
//
//   * Raw parse products — `PgEntityRaw` / `PgKeyRaw` / `PgColumnRaw` /
//     `PgIndexRaw`: the *unmodified* decorator input captured by the builder
//     parser (`builder/parser.ts`) for a single entity class. No defaults are
//     applied, no identifiers validated, no BooleanLike strings normalised.
//
//   * Runtime metadata   — `PgEntityMetadata` / `PgKeyMetadata` /
//     `PgColumnMetadata` / `PgIndexMetadata`: the validated, defaulted and
//     normalised form produced by `runtime/repository.ts`.
//
// Configuration metadata (`PgConfigMetadata`, …) describes the datasource
// definition and is independent of the entity pipeline.
// ---------------------------------------------------------------------------

// === Shared option primitives ==============================================

/**
 * A value that may be provided either as a real boolean or as a string that
 * resolves to a boolean (e.g. 'true' / 'false' / '1' / '0'). String forms are
 * accepted so configuration sources that only yield strings (env vars, YAML,
 * JSON) can still drive boolean options. The string is normalised to a boolean
 * during metadata resolution (see `runtime/repository.ts`).
 */
export type BooleanLike = boolean | string

/** Logical SQL column types. */
export type PgColumnType =
  | 'BIGINT'
  | 'DOUBLE'
  | 'BOOLEAN'
  | 'JSON_OBJECT'
  | 'JSON_ARRAY'
  | 'TEXT'
  | 'DATE'

// === Decorator option types ================================================

/** Options for @PgKey decorator */
export interface PgKeyOptions {
  /** column name in database, default '' (derived from property name) */
  column?: string
  /** whether the key is auto-generated (e.g. SERIAL / GENERATED ALWAYS), default true; accepts boolean or string */
  generated?: BooleanLike
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

/** Options for @PgIndex decorator (applied on the entity class) */
export interface PgIndexOptions {
  /** list of column names that form the index */
  columns: string[]
  /** whether the index is unique, default false; accepts boolean or string */
  unique?: BooleanLike
}

/** Options for @PgEntity decorator */
export interface PgEntityOptions {
  /** automatically create the table if it does not exist, default true; accepts boolean or string */
  createTableAuto?: BooleanLike
  /** automatically add new columns not present in the database, default true; accepts boolean or string */
  addColumnAuto?: BooleanLike
  /** automatically create indexes defined via @PgIndex, default true; accepts boolean or string */
  createIndexAuto?: BooleanLike
  /** database name, default '' (uses default connection db) */
  dbName?: string
  /** schema name, default 'public' */
  schema?: string
  /** table name in database, default snake_case of the class name */
  table?: string
  /** table comment, default '' */
  comment?: string
}

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
