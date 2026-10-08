// ---------------------------------------------------------------------------
// SQL templates (runtime)
//
// Central home for the raw SQL the runtime issues against the PostgreSQL
// catalog. Keeping every statement in one place gives the introspection
// queries a single definition and lets them be reviewed side by side.
//
// All templates use positional parameters ($1, $2, …) so callers bind values
// through `pg` instead of interpolating them into the string, which keeps both
// identifiers and values safe. The parameter order of each template is
// documented next to it and is meant to be passed straight to
// `PgDataSource.query(text, params)` / `PgDataSource.queryRead(text, params)`.
// ---------------------------------------------------------------------------

/**
 * Default schema assumed when an entity does not declare one.
 *
 * Mirrors the `@PgEntity({ schema })` default resolved by the builder parser,
 * which falls back to `'public'` as well.
 */
export const DEFAULT_SCHEMA = 'public'

// ---------------------------------------------------------------------------
// PgSqlTemplate — the runtime's SQL statement catalogue
//
// A stateless utility class: every member is a complete statement, so it is
// never instantiated. Feature code (schema introspection, migration checks,
// …) reads the templates from here instead of inlining SQL at the call site.
// ---------------------------------------------------------------------------

/** SQL template utility class: the statements used by the runtime. */
export class PgSqlTemplate {
  /** Default schema assumed when an entity does not declare one. */
  static readonly DEFAULT_SCHEMA = DEFAULT_SCHEMA

  /**
   * Create the `pg_trgm` extension when it is missing.
   *
   * Parameters: none.
   *
   * The extension name is a DDL identifier, not a bindable value, so it is
   * part of the statement itself rather than a `$n` placeholder. `IF NOT
   * EXISTS` makes the statement idempotent, so it is safe to run on every
   * boot.
   */
  static readonly CREATE_EXTENSION_PG_TRGM = 'CREATE EXTENSION IF NOT EXISTS "pg_trgm"'

  /**
   * Column definitions of a table: one row per column, in declaration order.
   *
   * Parameters: `$1` = schema, `$2` = table.
   *
   * Both `data_type` (e.g. `double precision`, `timestamp with time zone`)
   * and `udt_name` (the underlying type, e.g. `float8`) are returned, so a
   * caller can map a logical `PgColumnType` to the exact catalog shape.
   */
  static readonly COLUMN_DEFINITIONS = `
SELECT
  column_name,
  data_type,
  udt_name,
  column_default
FROM information_schema.columns
WHERE table_schema = $1
  AND table_name = $2
ORDER BY ordinal_position
`.trim()

  /**
   * Index definitions of a table: one row per index, via `pg_indexes`.
   *
   * Parameters: `$1` = schema, `$2` = table.
   *
   * `index_def` carries the full `CREATE INDEX …` statement, so an index that
   * already exists can be detected without re-deriving its columns.
   */
  static readonly INDEX_DEFINITIONS = `
SELECT
  indexname AS index_name,
  indexdef  AS index_def
FROM pg_indexes
WHERE schemaname = $1
  AND tablename = $2
ORDER BY indexname
`.trim()
}
