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
//
// Every statement produced here is written out with its own trailing semicolon,
// so a multi-statement script is built by joining the statements with a newline
// (`\n`) — the terminator stays part of each statement.
// ---------------------------------------------------------------------------

import type {
  PgColumnDefault,
  PgColumnMetadata,
  PgColumnType,
  PgEntityMetadata,
  PgIndexMetadata,
} from '../shared/types.ts'

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

/**
 * Map a logical `PgColumnType` to the PostgreSQL column type it is stored as.
 *
 * `JSON_OBJECT` and `JSON_ARRAY` both map to `JSONB` — PostgreSQL's binary JSON
 * type. `DOUBLE` and `DATE` map to `DOUBLE PRECISION` and `TIMESTAMPTZ`, the
 * catalog shapes referenced by {@link COLUMN_DEFINITIONS}.
 */
const COLUMN_TYPE_SQL: Record<PgColumnType, string> = {
  BIGINT: 'BIGINT',
  INT: 'INTEGER',
  DOUBLE: 'DOUBLE PRECISION',
  BOOLEAN: 'BOOLEAN',
  JSON_OBJECT: 'JSONB',
  JSON_ARRAY: 'JSONB',
  TEXT: 'TEXT',
  DATE: 'TIMESTAMPTZ',
}

/** Quote a value as a PostgreSQL string literal, doubling embedded quotes. */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Build the SQL literal expression of a column's normalised default.
 *
 * Returns an empty string when the default is `null` (or `undefined`) or a
 * `Date`, so the caller omits the clause and PostgreSQL applies its own
 * implicit default. The value is categorised by its JavaScript type, which the
 * builder already derived from the column type: numbers and booleans are
 * inlined unquoted (`true` / `false`), `TEXT` strings are quoted, and the JSON
 * shapes (an object / array) are quoted as JSON text.
 *
 * Exported so the introspection layer can render a declared default exactly as
 * it was written — the same literal PostgreSQL stores — instead of re-deriving
 * it. {@link columnDefaultClause} wraps it for the `DEFAULT` clause.
 */
export function columnDefaultExpression(value: PgColumnDefault): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return ''
  if (typeof value === 'number') return `${value}`
  if (typeof value === 'boolean') return `${value}`
  if (typeof value === 'string') return quoteLiteral(value)
  return quoteLiteral(JSON.stringify(value))
}

/**
 * Build the `DEFAULT <literal>` clause for a column's normalised default.
 *
 * Wraps {@link columnDefaultExpression}: an empty expression (the default is
 * `null` / `undefined` / `Date`) produces an empty clause, so `CREATE TABLE` /
 * `ADD COLUMN` omit it and {@link PgSqlTemplate.alterColumnDefault} drops the
 * default instead.
 */
function columnDefaultClause(value: PgColumnDefault): string {
  const expression = columnDefaultExpression(value)
  return expression ? ` DEFAULT ${expression}` : ''
}

/** Build a schema-qualified, quoted table reference: `"schema"."table"`. */
function qualifyTable(schema: string, table: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`
}

/**
 * Maximum length of the `<table>_<col>…` part of an index name.
 *
 * PostgreSQL truncates identifiers to 63 bytes. The name also carries a `_idx`
 * / `_uq` / `_gin` suffix (4 characters including the separator), so the base is
 * cut to 59 to keep the whole name within 63 characters.
 */
const INDEX_NAME_BASE_MAX_LENGTH = 59

/**
 * Derive the name of an index from its table and definition.
 *
 * The name is `<table>_<col>…_<suffix>`: the table and columns are joined with
 * underscores and cut to {@link INDEX_NAME_BASE_MAX_LENGTH} characters, then a
 * `gin` (GIN index), `uq` (unique index) or `idx` (any other index) suffix is
 * appended. Including the table keeps the name unique across the schema
 * (PostgreSQL requires index names to be unique per schema).
 */
export function indexName(table: string, index: PgIndexMetadata): string {
  const suffix = index.gin ? 'gin' : index.unique ? 'uq' : 'idx'
  const base = [table, ...index.columns].join('_')
  return `${base.slice(0, INDEX_NAME_BASE_MAX_LENGTH)}_${suffix}`
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
  static readonly CREATE_EXTENSION_PG_TRGM = 'CREATE EXTENSION IF NOT EXISTS "pg_trgm";'

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
    return `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)};`
  }

  /**
   * Build the `CREATE TABLE` script for an entity.
   *
   * The table is created with `IF NOT EXISTS`, so the statement is idempotent.
   * The key column is emitted first and carries the `PRIMARY KEY` constraint;
   * the regular columns follow in declaration order, each carrying the `DEFAULT`
   * clause built from its normalised default when it has one — `null` and `Date`
   * defaults are omitted (see {@link columnDefaultClause}). Identifiers cannot
   * be bind parameters, so the schema, table and column names are quoted with
   * `quoteIdentifier`.
   *
   * When the entity — or any of its columns — declares a comment, the matching
   * `COMMENT ON TABLE` / `COMMENT ON COLUMN` statements are appended, and every
   * declared index is emitted through {@link PgSqlTemplate.createIndex}, so the
   * returned string is a complete, runnable script: each statement is
   * terminated with `;` and the statements are joined with a newline.
   *
   * @param metadata The resolved entity metadata to build the script from.
   */
  static createTable(metadata: PgEntityMetadata): string {
    const tableRef = qualifyTable(metadata.schema, metadata.table)

    const columnDefinitions = [
      `${quoteIdentifier(metadata.key.column)} ${COLUMN_TYPE_SQL[metadata.key.columnType]} PRIMARY KEY`,
      ...metadata.columns.map(
        column =>
          `${quoteIdentifier(column.column)} ${COLUMN_TYPE_SQL[column.columnType]}${columnDefaultClause(column.default)}`,
      ),
    ]

    const statements = [
      `CREATE TABLE IF NOT EXISTS ${tableRef} (\n${columnDefinitions.map(definition => `  ${definition}`).join(',\n')}\n);`,
    ]

    if (metadata.comment) {
      statements.push(`COMMENT ON TABLE ${tableRef} IS ${quoteLiteral(metadata.comment)};`)
    }
    if (metadata.key.comment) {
      statements.push(
        `COMMENT ON COLUMN ${tableRef}.${quoteIdentifier(metadata.key.column)} IS ${quoteLiteral(metadata.key.comment)};`,
      )
    }
    for (const column of metadata.columns) {
      if (column.comment) {
        statements.push(
          `COMMENT ON COLUMN ${tableRef}.${quoteIdentifier(column.column)} IS ${quoteLiteral(column.comment)};`,
        )
      }
    }
    for (const index of metadata.indexes) {
      statements.push(PgSqlTemplate.createIndex(metadata.schema, metadata.table, index))
    }

    return statements.join('\n')
  }

  /**
   * Build the statement that creates a table index.
   *
   * The access method follows the index metadata: a `unique` index becomes
   * `CREATE UNIQUE INDEX`, while a `gin` index adds `USING gin` and the
   * `gin_trgm_ops` operator class to every column (the trigram class requires
   * the `pg_trgm` extension). The two are mutually exclusive (enforced by the
   * builder parser). The index is named deterministically (see `indexName`) and
   * created with `IF NOT EXISTS`, so the statement is idempotent.
   *
   * @param schema Schema the indexed table lives in.
   * @param table Table the index is created on.
   * @param index The resolved index metadata to build the statement from.
   */
  static createIndex(schema: string, table: string, index: PgIndexMetadata): string {
    const tableRef = qualifyTable(schema, table)
    const columns = index.gin
      ? index.columns.map(column => `${quoteIdentifier(column)} gin_trgm_ops`).join(', ')
      : index.columns.map(quoteIdentifier).join(', ')
    const unique = index.unique ? 'UNIQUE ' : ''
    const using = index.gin ? ' USING gin' : ''
    return `CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdentifier(indexName(table, index))} ON ${tableRef}${using} (${columns});`
  }

  /**
   * Build the `ALTER TABLE … ADD COLUMN` script for a single column.
   *
   * The column is added with `IF NOT EXISTS`, so the statement is idempotent —
   * safe to run on every boot against a table that may already carry the column.
   * Its definition mirrors the one emitted by
   * {@link PgSqlTemplate.createTable}: the type comes from
   * {@link COLUMN_TYPE_SQL}, and the `DEFAULT` clause is built by
   * `columnDefaultClause` (`null` and `Date` defaults are omitted). Identifiers
   * cannot be bind parameters, so the schema, table and column names are quoted
   * with `quoteIdentifier`.
   *
   * When the column declares a comment, the matching `COMMENT ON COLUMN`
   * statement is appended, so the returned string is a complete, runnable
   * script: each statement is terminated with `;` and the statements are joined
   * with a newline.
   *
   * @param schema Schema the table lives in.
   * @param table Table the column is added to.
   * @param column The resolved column metadata to build the statement from.
   */
  static addColumn(schema: string, table: string, column: PgColumnMetadata): string {
    const tableRef = qualifyTable(schema, table)
    const columnRef = `${tableRef}.${quoteIdentifier(column.column)}`

    const statements = [
      `ALTER TABLE ${tableRef} ADD COLUMN IF NOT EXISTS ${quoteIdentifier(column.column)} ${COLUMN_TYPE_SQL[column.columnType]}${columnDefaultClause(column.default)};`,
    ]

    if (column.comment) {
      statements.push(`COMMENT ON COLUMN ${columnRef} IS ${quoteLiteral(column.comment)};`)
    }

    return statements.join('\n')
  }

  /**
   * Build the statement that changes the type of an existing column.
   *
   * The target type comes from {@link COLUMN_TYPE_SQL}, so it is the same
   * catalog shape emitted by {@link PgSqlTemplate.createTable} and
   * {@link PgSqlTemplate.addColumn}. No `USING` clause is emitted, so the
   * statement succeeds only when PostgreSQL knows an implicit or assignment
   * cast between the current and the target type; a conversion that needs an
   * explicit cast must be run by the caller with its own `USING` expression.
   * Note that PostgreSQL rewrites the whole table for conversions that are not
   * binary-coercible, so the statement is not free to re-run.
   *
   * Identifiers cannot be bind parameters, so the schema, table and column
   * names are quoted with `quoteIdentifier`.
   *
   * @param schema Schema the table lives in.
   * @param table Table carrying the column.
   * @param column The resolved column metadata to build the statement from.
   */
  static alterColumnType(schema: string, table: string, column: PgColumnMetadata): string {
    const tableRef = qualifyTable(schema, table)
    return `ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(column.column)} TYPE ${COLUMN_TYPE_SQL[column.columnType]};`
  }

  /**
   * Build the statement that sets or drops the default of an existing column.
   *
   * The default expression is built by `columnDefaultExpression`, so it is the
   * same literal emitted by {@link PgSqlTemplate.createTable} and
   * {@link PgSqlTemplate.addColumn}: `null` / `undefined` / `Date` defaults
   * carry no expression, and the column is reset with
   * `ALTER COLUMN … DROP DEFAULT`; any other value is applied with
   * `ALTER COLUMN … SET DEFAULT <literal>`. Either form is idempotent — the
   * statement can be re-run on every boot without side effects.
   *
   * Identifiers cannot be bind parameters, so the schema, table and column
   * names are quoted with `quoteIdentifier`.
   *
   * @param schema Schema the table lives in.
   * @param table Table carrying the column.
   * @param column The resolved column metadata to build the statement from.
   */
  static alterColumnDefault(schema: string, table: string, column: PgColumnMetadata): string {
    const tableRef = qualifyTable(schema, table)
    const expression = columnDefaultExpression(column.default)
    return expression
      ? `ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(column.column)} SET DEFAULT ${expression};`
      : `ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(column.column)} DROP DEFAULT;`
  }

  /**
   * Build the `INSERT` statement for an entity.
   *
   * The column list is derived from the entity metadata: the key column first,
   * then the declared columns in declaration order — the same order
   * {@link PgSqlTemplate.createTable} emits, so the two stay aligned. Every
   * column is written, so the statement always inserts a complete row.
   *
   * Identifiers cannot be bind parameters, so the schema, table and column
   * names are quoted with `quoteIdentifier`, while the values themselves are
   * bound positionally.
   *
   * Parameters: `$1` = the key value, `$2 … $n` = the values of
   * {@link PgEntityMetadata.columns}, in order — one parameter per column, none
   * omitted.
   *
   * The statement carries no `RETURNING` clause: it reports only that the row
   * was inserted, and a caller that needs the stored row reads it back with its
   * own `SELECT`.
   *
   * @param metadata The resolved entity metadata to build the statement from.
   */
  static insertRow(metadata: PgEntityMetadata): string {
    const tableRef = qualifyTable(metadata.schema, metadata.table)
    const columns = PgSqlTemplate.insertColumns(metadata)
    const placeholders = columns.map((_, index) => `$${index + 1}`)

    return [
      `INSERT INTO ${tableRef} (`,
      columns.map(column => `  ${quoteIdentifier(column)}`).join(',\n'),
      `) VALUES (${placeholders.join(', ')});`,
    ].join('\n')
  }

  /**
   * Collect the values {@link PgSqlTemplate.insertRow} binds for a record.
   *
   * The values are read from `row` in exactly the order the statement binds
   * them: the key column first, then the declared columns in declaration order —
   * the same order {@link PgSqlTemplate.insertColumns} returns, so the statement
   * and its parameter list are derived from one definition and cannot drift
   * apart.
   *
   * Each value is looked up by PostgreSQL column name — the key through
   * `PgKeyMetadata.column`, the columns through `PgColumnMetadata.column` — and
   * a column `row` does not carry is returned as `null`, so the result always
   * has exactly one entry per placeholder.
   *
   * @param metadata The resolved entity metadata to read the column order from.
   * @param row      The record whose values are collected.
   * @returns One value per `insertRow` placeholder, in parameter order.
   */
  static insertRowValues<T>(metadata: PgEntityMetadata, row: T): unknown[] {
    const fields = row as Record<string, unknown>
    return PgSqlTemplate.insertColumns(metadata).map(column => fields[column] ?? null)
  }

  /**
   * Return the column names an `INSERT` writes, in parameter order.
   *
   * The key column comes first, then the declared columns in declaration order —
   * the same order {@link PgSqlTemplate.createTable} emits its column
   * definitions in. Shared by {@link PgSqlTemplate.insertRow} (the column list)
   * and {@link PgSqlTemplate.insertRowValues} (the value list), so both stay
   * aligned by construction.
   *
   * @param metadata The resolved entity metadata to read the column order from.
   */
  private static insertColumns(metadata: PgEntityMetadata): string[] {
    return [metadata.key.column, ...metadata.columns.map(column => column.column)]
  }

  /**
   * Build the `UPDATE` statement for an entity.
   *
   * The statement rewrites the whole row: every column declared by the entity
   * metadata is assigned, in declaration order. The key column is the exception
   * — it addresses the row in the `WHERE` clause instead of being assigned, so
   * the statement can never rewrite a primary key. That matches the contract of
   * a full-record update, where every column carries its new value.
   *
   * Identifiers cannot be bind parameters, so the schema, table and column
   * names are quoted with `quoteIdentifier`, while the values themselves are
   * bound positionally.
   *
   * Parameters: `$1 … $n` = the values of {@link PgEntityMetadata.columns}, in
   * order, then `$n + 1` = the key value — the key is always the last parameter.
   *
   * The statement carries no `RETURNING` clause, matching
   * {@link PgSqlTemplate.insertRow}.
   *
   * @param metadata The resolved entity metadata to build the statement from.
   * @throws When the entity declares no columns to write, since the statement
   *         would carry an empty assignment list.
   */
  static updateRow(metadata: PgEntityMetadata): string {
    const columns = PgSqlTemplate.updateColumns(metadata)
    if (columns.length === 0) {
      throw new Error(
        `Cannot build an UPDATE for "${metadata.schema}"."${metadata.table}": ` +
          'the entity declares no columns to write.',
      )
    }

    const tableRef = qualifyTable(metadata.schema, metadata.table)
    const assignments = columns.map((column, index) => `  ${quoteIdentifier(column)} = $${index + 1}`)

    return [
      `UPDATE ${tableRef} SET`,
      assignments.join(',\n'),
      `WHERE ${quoteIdentifier(metadata.key.column)} = $${columns.length + 1};`,
    ].join('\n')
  }

  /**
   * Collect the values {@link PgSqlTemplate.updateRow} binds for a record.
   *
   * The values are read from `row` in exactly the order the statement binds
   * them: the declared columns in declaration order first, then the key value
   * last — the reverse of {@link PgSqlTemplate.insertRowValues}, where the key
   * comes first. Both lists derive from {@link PgSqlTemplate.updateColumns}, so
   * the statement and its parameter list cannot drift apart.
   *
   * Each value is looked up by PostgreSQL column name — the columns through
   * `PgColumnMetadata.column`, the key through `PgKeyMetadata.column` — and a
   * column `row` does not carry is returned as `null`, so the result always has
   * exactly one entry per placeholder.
   *
   * @param metadata The resolved entity metadata to read the column order from.
   * @param row      The record whose values are collected.
   * @returns One value per `updateRow` placeholder, in parameter order.
   */
  static updateRowValues<T>(metadata: PgEntityMetadata, row: T): unknown[] {
    const fields = row as Record<string, unknown>
    const columns = PgSqlTemplate.updateColumns(metadata)

    return [...columns.map(column => fields[column] ?? null), fields[metadata.key.column] ?? null]
  }

  /**
   * Return the column names an `UPDATE` assigns, in parameter order.
   *
   * The declared columns come in declaration order; the key column is not among
   * them — it addresses the row in the `WHERE` clause instead. Shared by
   * {@link PgSqlTemplate.updateRow} (the assignment list) and
   * {@link PgSqlTemplate.updateRowValues} (the value list), so both stay aligned
   * by construction.
   *
   * @param metadata The resolved entity metadata to read the column order from.
   */
  private static updateColumns(metadata: PgEntityMetadata): string[] {
    return metadata.columns.map(column => column.column)
  }

  /**
   * Build the `DELETE` statement for an entity.
   *
   * The row is addressed by the entity's key column, so the statement carries a
   * single `WHERE` predicate — no other column takes part in it. Identifiers
   * cannot be bind parameters, so the schema, table and column names are quoted
   * with `quoteIdentifier`, while the key value is bound positionally.
   *
   * Parameters: `$1` = the key value.
   *
   * The statement carries no `RETURNING` clause, matching
   * {@link PgSqlTemplate.insertRow} and {@link PgSqlTemplate.updateRow}:
   * `rowCount` already reports whether a row matched, which is all a delete
   * needs to answer.
   *
   * @param metadata The resolved entity metadata to build the statement from.
   */
  static deleteRow(metadata: PgEntityMetadata): string {
    const tableRef = qualifyTable(metadata.schema, metadata.table)
    return [
      `DELETE FROM ${tableRef}`,
      `WHERE ${quoteIdentifier(metadata.key.column)} = $1;`,
    ].join('\n')
  }

  /**
   * Build the primary-key lookup statement for an entity.
   *
   * The column list mirrors {@link PgSqlTemplate.insertRow}: the key column
   * first, then the declared columns in declaration order, so a row read back
   * has the same shape the insert wrote. The row is addressed by the entity's
   * key column, so the statement carries a single `WHERE` predicate — no other
   * column takes part in it.
   *
   * Identifiers cannot be bind parameters, so the schema, table and column
   * names are quoted with `quoteIdentifier`, while the key value is bound
   * positionally.
   *
   * Parameters: `$1` = the key value.
   *
   * The statement yields at most one row, so a key with no matching row is
   * reported as an empty result rather than as an error.
   *
   * @param metadata The resolved entity metadata to build the statement from.
   */
  static selectRow(metadata: PgEntityMetadata): string {
    const tableRef = qualifyTable(metadata.schema, metadata.table)
    const columns = [metadata.key.column, ...metadata.columns.map(column => column.column)]

    return [
      'SELECT',
      columns.map(column => `  ${quoteIdentifier(column)}`).join(',\n'),
      `FROM ${tableRef}`,
      `WHERE ${quoteIdentifier(metadata.key.column)} = $1;`,
    ].join('\n')
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
  created_at     TIMESTAMPTZ NOT NULL
);
`.trim()

  /**
   * Record one executed SQL script in `sql_execution_script`.
   *
   * Parameters: `$1` = id, `$2` = table_name, `$3` = script_content,
   * `$4` = created_at.
   */
  static readonly INSERT_SQL_EXECUTION_SCRIPT = `
INSERT INTO public.sql_execution_script (
  id,
  table_name,
  script_content,
  created_at
) VALUES ($1, $2, $3, $4);
`.trim()

  /**
   * Initialization script run once per database at startup.
   *
   * Merges {@link CREATE_EXTENSION_PG_TRGM} and
   * {@link CREATE_SQL_EXECUTION_SCRIPT_TABLE} into a single script: each
   * statement already ends with `;`, so they are simply joined with a newline.
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
  ].join('\n')

  /**
   * Column definitions of a table: one row per column, in declaration order.
   *
   * Parameters: `$1` = schema, `$2` = table.
   *
   * `udt_name` (the underlying type, e.g. `float8`) is returned, so a caller
   * can map a logical `PgColumnType` to the exact catalog shape.
   */
  static readonly COLUMN_DEFINITIONS = `
SELECT
  column_name,
  udt_name,
  column_default
FROM information_schema.columns
WHERE table_schema = $1
  AND table_name = $2
ORDER BY ordinal_position;
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
ORDER BY indexname;
`.trim()
}
