// ---------------------------------------------------------------------------
// PostgreSQL naming conventions (shared)
//
// The single place where a JavaScript name and its PostgreSQL counterpart are
// converted into each other. Both lifecycle stages need it, which is why it
// lives in `shared/`: the builder derives a table / column name from the class
// and property names (`camelToSnake`), while the runtime turns the snake_case
// names the catalog reports into the camelCase shape the runtime types use
// (`snakeToCamel`, `camelizeKeys`).
//
// `shared/` is the only layer `builder/` and `runtime/` may both import from
// (see tests/architecture.test.ts), so the convention can only be defined once
// — here. The module stays dependency-free on purpose: no `typescript`, no
// `pg`.
//
// The two directions are halves of one convention rather than exact inverses:
// `camelToSnake` lowercases its input, so the original casing of a run of
// capitals cannot survive the round trip (`HTTPServer` -> `http_server` ->
// `httpServer`). The invariant that does hold is the snake-to-camel one: for a
// snake_case name `s`, `camelToSnake(snakeToCamel(s)) === s`.
// ---------------------------------------------------------------------------

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
 * Rebuild a row with every key converted to camelCase: `column_default` →
 * `columnDefault`.
 *
 * The values are carried over untouched. `T` is the shape the caller expects
 * the converted row to have; it is not validated at runtime.
 */
export function camelizeKeys<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [snakeToCamel(key), value]),
  ) as T
}
