/**
 * PostgreSQL decorator option types
 */

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
  /** default value expression for the column, default '' */
  defaultValue?: string
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
  indexes: PgIndexOptions[]
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
  defaultValue: string
  comment: string
  columnType: PgColumnType
}
