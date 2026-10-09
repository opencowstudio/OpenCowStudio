// ---------------------------------------------------------------------------
// SQL templates (runtime)
//
// Central home for the raw SQL the runtime issues against the PostgreSQL
// catalog. Keeping every statement in one place gives the introspection
// queries a single definition and lets them be reviewed side by side.
//
// Value templates use positional parameters ($1, $2, …) so callers bind values
// through `pg` instead of interpolating them into the string. DDL that *names*
// an object (an extension, a schema, a table) cannot bind an identifier, so the
// name is quoted into the statement instead — see `quoteIdentifier`. The
// parameter order of each template is documented next to it, and a template is
// meant to be passed straight to `PgDataSource.query(text, params)` /
// `PgDataSource.queryRead(text, params)`.
// ---------------------------------------------------------------------------

/**
 * Default schema assumed when an entity does not declare one.
 *
 * Mirrors the `@PgEntity({ schema })` default resolved by the builder parser,
 * which falls back to `'public'` as well.
 */
export const DEFAULT_SCHEMA = 'public'

/**
 * Quote a PostgreSQL identifier so it can be safely embedded in a statement.
 *
 * An identifier cannot be a bind parameter, so DDL interpolates it. Doubling
 * any embedded double quote follows the PostgreSQL quoting rules and stops the
 * value from escaping the identifier.
 */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

// ---------------------------------------------------------------------------
// PgSqlTemplate — the runtime's SQL statement catalogue
//
// A stateless utility class: every member holds or builds a complete statement,
// so it is never instantiated. Feature code (schema introspection, migration
// checks, …) reads the templates from here instead of inlining SQL at the call
// site.
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
   * Build the statement that creates a schema when it is missing.
   *
   * Parameters: none. The schema name is a DDL identifier, so — unlike the
   * value templates — it cannot be a bind parameter; it is passed through
   * `quoteIdentifier` instead, which keeps it injection-safe. `IF NOT EXISTS`
   * makes the statement idempotent.
   *
   * @param schema Schema to create; defaults to {@link DEFAULT_SCHEMA}.
   */
  static createSchema(schema: string = PgSqlTemplate.DEFAULT_SCHEMA): string {
    return `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)}`
  }

  /**
   * Create the table that records every executed SQL script.
   *
   * Parameters: none.
   *
   * `IF NOT EXISTS` makes the statement idempotent, so it is safe to run on
   * every boot. The table lives in the {@link DEFAULT_SCHEMA} schema.
   */
  static readonly CREATE_SQL_EXECUTION_SCRIPT_TABLE = `
CREATE TABLE IF NOT EXISTS public.sql_execution_script (
  id             TEXT PRIMARY KEY,
  table_name     TEXT NOT NULL,
  script_content TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  created_at_ts  BIGINT NOT NULL
)
`.trim()

  /**
   * Record one executed SQL script in `sql_execution_script`.
   *
   * Parameters: `$1` = id, `$2` = table_name, `$3` = script_content,
   * `$4` = created_at, `$5` = created_at_ts.
   */
  static readonly INSERT_SQL_EXECUTION_SCRIPT = `
INSERT INTO public.sql_execution_script (
  id,
  table_name,
  script_content,
  created_at,
  created_at_ts
) VALUES ($1, $2, $3, $4, $5)
`.trim()

  /**
   * Initialization script run once per database at startup.
   *
   * Merges {@link CREATE_EXTENSION_PG_TRGM} and
   * {@link CREATE_SQL_EXECUTION_SCRIPT_TABLE} into a single statement string.
   * Because it takes no parameters, `pg` sends it over the simple query
   * protocol, so the whole script runs in one connection and one round trip.
   * PostgreSQL executes a multi-statement simple query inside a single
   * implicit transaction, so either every object is created or none is.
   *
   * Parameters: none.
   */
  static readonly INITIALIZATION_SCRIPT = [
    PgSqlTemplate.CREATE_EXTENSION_PG_TRGM,
    PgSqlTemplate.CREATE_SQL_EXECUTION_SCRIPT_TABLE,
  ].join(';\n')

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
