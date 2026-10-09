import { consola } from 'consola'
import type { PgColumnType } from '../shared/types.ts'

// ---------------------------------------------------------------------------
// Entity decorators + their option types
//
// `@PgEntity` / `@PgKey` / `@PgColumn` / `@PgIndex` are *static markers*. They
// carry no behaviour at runtime beyond `@PgKey`'s value guard (a data contract
// the static parser cannot enforce). All configuration is read by the builder
// parser (`builder/parser.ts`) straight from the decorator *source*, so no class
// is ever instantiated during scanning.
//
// This module owns the decorator *option* types (`PgEntityOptions`,
// `PgKeyOptions`, `PgColumnOptions`, `PgIndexOptions`). The shared
// `PgColumnType` primitive lives in `shared/types.ts` alongside the metadata
// shapes and is re-imported here (type-only), so the dependency points one way:
// `builder/decorators.ts` -> `shared/types.ts`.
//
// It carries no `typescript` dependency, so the package entry can safely
// re-export the markers for entity classes to use at runtime (including
// `@PgKey`'s value guard).
// ---------------------------------------------------------------------------

// Tagged logger so the core stays framework-agnostic (no Nuxt dep).
const logger = consola.withTag('pg')

// === Decorator option types ================================================

/** Options for @PgKey decorator */
export interface PgKeyOptions {
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

/** Options for @PgIndex decorator (applied on the entity class) */
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
  /** automatically create indexes defined via @PgIndex, default true */
  createIndexAuto?: boolean
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
