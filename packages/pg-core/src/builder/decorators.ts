import { consola } from 'consola'
import type {
  PgColumnOptions,
  PgEntityOptions,
  PgIndexOptions,
  PgKeyOptions,
} from '../shared/types.ts'

// ---------------------------------------------------------------------------
// Entity decorators
//
// `@PgEntity` / `@PgKey` / `@PgColumn` / `@PgIndex` are *static markers*. They
// carry no behaviour at runtime beyond `@PgKey`'s value guard (a data contract
// the static parser cannot enforce). All configuration is read by the builder
// parser (`builder/parser.ts`) straight from the decorator *source*, so no class
// is ever instantiated during scanning.
//
// The decorator *option* types (`PgEntityOptions`, `PgKeyOptions`,
// `PgColumnOptions`, `PgIndexOptions`) and every shared primitive live in
// `shared/types.ts`; this module imports them (type-only) and owns only the
// decorator functions. The dependency is one-way (`runtime/` -> `shared/`), so
// there is no import cycle.
//
// It lives in `builder/`: these functions are the decorator markers whose options
// the builder parser reads from source. They carry no `typescript` dependency,
// so the package entry can safely re-export them for entity classes (which
// execute them at runtime, including `@PgKey`'s value guard). It must stay free
// of `typescript` and `pg`.
// ---------------------------------------------------------------------------

// Tagged logger so the core stays framework-agnostic (no Nuxt dep).
const logger = consola.withTag('pg')

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
