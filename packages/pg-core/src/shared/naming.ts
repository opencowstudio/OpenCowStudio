// ---------------------------------------------------------------------------
// PostgreSQL naming conventions (shared)
//
// The single place where a JavaScript name and its PostgreSQL counterpart are
// converted into each other. Both lifecycle stages need it, which is why it
// lives in `shared/`: the builder derives a table / column name from the class
// and property names (`camelToSnake`), while the runtime turns the snake_case
// names the catalog reports into the camelCase shape the runtime types use
// (`snakeToCamel`, `camelizeKeys`). `snakeizeKeys` applies the same bulk
// rewrite to a whole row in the opposite direction.
//
// `shared/` is the only layer `builder/` and `runtime/` may both import from
// (see tests/architecture.test.ts), so the convention can only be defined once
// — here. The module stays free of `typescript` and `pg` on purpose; the only
// dependency is `consola`, for the diagnostics of {@link assertValidPgName}.
//
// The same reasoning puts the identifier check here: a schema, table or column
// name is a naming concern, and both the builder (before it records the name)
// and any other layer may validate one without pulling in the build-time parser.
//
// The two directions are halves of one convention rather than exact inverses:
// `camelToSnake` lowercases its input, so the original casing of a run of
// capitals cannot survive the round trip (`HTTPServer` -> `http_server` ->
// `httpServer`). The invariant that does hold is the snake-to-camel one: for a
// snake_case name `s`, `camelToSnake(snakeToCamel(s)) === s`.
// ---------------------------------------------------------------------------

import { consola } from 'consola'

/** Tagged logger so the core stays framework-agnostic (no Nuxt dep). */
const logger = consola.withTag('pg-naming')

/**
 * Convert a camelCase name (typically a field name) to snake_case.
 *
 * A capital that follows a lowercase letter or a digit is separated
 * (`columnDefault` -> `column_default`), as is the lowercase letter that ends a
 * run of capitals (`HTTPServer` -> `http_server`). Whitespace and dashes are
 * collapsed into a single underscore, the result is lowercased, and an already
 * snake_case name passes through unchanged.
 */
export function camelToSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

/**
 * Convert a snake_case name to camelCase: `column_default` → `columnDefault`.
 *
 * Only an underscore followed by a lowercase letter or a digit is transformed;
 * any other character is left as-is, so an already camelCase name passes
 * through unchanged.
 */
export function snakeToCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

/**
 * Rebuild a row keeping only the keys that actually change: `column_default` →
 * `columnDefault`. A key that `snakeToCamel` leaves untouched is dropped.
 *
 * The values of the kept entries are carried over untouched. Every converted key
 * remembers the snake_case key it came from; those original keys are removed
 * from the result before it is returned, so only the camelCase spelling
 * survives. `T` is the shape the caller expects the converted row to have; it is
 * not validated at runtime.
 */
export function camelizeKeys<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  const originalKeys: string[] = []

  for (const [key, value] of Object.entries(row)) {
    const camelKey = snakeToCamel(key)
    if (camelKey !== key) {
      result[camelKey] = value
      // Remember the source key so it can be dropped again below.
      originalKeys.push(key)
    }
  }

  for (const originalKey of originalKeys) {
    delete result[originalKey]
  }

  return result as T
}

/**
 * Reverse of {@link camelizeKeys}: rebuild a row keeping only the keys that
 * actually change, `columnDefault` → `column_default`. A key that `camelToSnake`
 * leaves untouched is dropped.
 *
 * `camelToSnake` lowercases its input, so a converted key may collide with an
 * already snake_case key of the row; the source keys are remembered and removed
 * before the result is returned, so only the snake_case spelling survives. The
 * values of the kept entries are carried over untouched. `T` is the shape the
 * caller expects the converted row to have; it is not validated at runtime.
 */
export function snakeizeKeys<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  const originalKeys: string[] = []

  for (const [key, value] of Object.entries(row)) {
    const snakeKey = camelToSnake(key)
    if (snakeKey !== key) {
      result[snakeKey] = value
      // Remember the source key so it can be dropped again below.
      originalKeys.push(key)
    }
  }

  for (const originalKey of originalKeys) {
    delete result[originalKey]
  }

  return result as T
}

// === Name validation =======================================================

/**
 * Allowed pattern for a PostgreSQL name: the characters `a-zA-Z0-9_` only.
 *
 * Every schema, table and column name parsed by the builder is checked against
 * this pattern before any metadata object is built.
 */
const NAME_RE = /^[a-zA-Z0-9_]+$/

/**
 * Validate that `name` is a legal PostgreSQL name.
 *
 * Only the characters `a-zA-Z0-9_` are allowed. A non-compliant name is
 * rejected (logged + thrown), so no metadata object is ever built from an
 * invalid schema, table or column name.
 *
 * @param name The name to validate.
 * @param kind The kind of name — `schema`, `table`, `column`, … — used in the
 * diagnostic message.
 * @param context Where the name was declared (the entity / column it belongs
 * to), used in the diagnostic message.
 */
export function assertValidPgName(name: string, kind: string, context: string): void {
  if (!NAME_RE.test(name)) {
    const message = `Invalid ${kind} "${name}" for ${context}: only characters [a-zA-Z0-9_] are allowed.`
    logger.error(message)
    throw new Error(message)
  }
}
