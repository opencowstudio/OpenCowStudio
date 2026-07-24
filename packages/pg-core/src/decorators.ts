import { consola } from 'consola'

// ---------------------------------------------------------------------------
// Entity decorators
//
// `@PgEntity` / `@PgKey` / `@PgColumn` / `@PgIndex` are *static markers*. They
// carry no behaviour at runtime beyond `@PgKey`'s value guard (a data contract
// the static parser cannot enforce). All configuration is read by the builder
// parser (`builder/parser.ts`) straight from the decorator *source*, so no class
// is ever instantiated during scanning.
//
// This module also owns the decorator *option* types (`PgEntityOptions`,
// `PgKeyOptions`, `PgColumnOptions`, `PgIndexOptions`) plus the shared
// `BooleanLike` / `PgColumnType` primitives they rely on. The raw parse
// products (`PgEntityRaw`, …) and the resolved runtime metadata
// (`PgEntityMetadata`, …) live in `types.ts`; the raw → metadata resolution
// lives in `runtime/repository.ts`.
// ---------------------------------------------------------------------------

// Tagged logger so the core stays framework-agnostic (no Nuxt dep).
const logger = consola.withTag('pg')

// === Option primitives =====================================================

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

// === Decorator option types ===============================================

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

// === @PgKey — marks a property as a primary / unique key column ============
//
// Acts as a static marker for the builder parser. At runtime its
// `addInitializer` guards that an *instance* key value is a string (a runtime
// data contract the static parser cannot enforce).
// ---------------------------------------------------------------------------

export function PgKey(_options: PgKeyOptions = {}): <C, V>(
  value: undefined,
  context: ClassFieldDecoratorContext<C, V>,
) => void {
  return function (_value: undefined, context: ClassFieldDecoratorContext): void {
    const propertyKey = context.name

    context.addInitializer(function (this: unknown): void {
      const value = (this as Record<string | symbol, unknown>)[propertyKey]
      if (value !== undefined && typeof value !== 'string') {
        const message = `Invalid PgKey field "${String(propertyKey)}": key value must be a string, but got type "${typeof value}" (value: ${JSON.stringify(value)}).`
        logger.error(message)
        throw new Error(message)
      }
    })
  }
}

// === @PgColumn — marks a property as a regular table column (static marker) =

export function PgColumn(_options: PgColumnOptions = {}): <C, V>(
  value: undefined,
  context: ClassFieldDecoratorContext<C, V>,
) => void {
  return function (_value: undefined, _context: ClassFieldDecoratorContext): void {
    // Marker only — raw options are read statically by the builder parser.
  }
}

// === @PgIndex — marks an index on the entity (static marker, class-level) ===

export function PgIndex(_options: PgIndexOptions): <C extends abstract new (...args: unknown[]) => unknown>(
  value: C,
  context: ClassDecoratorContext<C>,
) => C | void {
  return function (_value: Function, _context: ClassDecoratorContext): void {
    // Marker only — raw options are read statically by the builder parser.
  }
}

// === @PgEntity — marks a class as a PostgreSQL entity (table) (static marker)

export function PgEntity(_options: PgEntityOptions = {}): <C extends abstract new (...args: unknown[]) => unknown>(
  value: C,
  context: ClassDecoratorContext<C>,
) => C | void {
  return function (_value: Function, _context: ClassDecoratorContext): void {
    // Marker only — raw options are read statically by the builder parser.
  }
}
