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
// name is quoted into the statement instead — every identifier is wrapped in
// double quotes (see `quoteIdentifier`) so a name can never be read as a
// keyword or folded to lower case. The parameter order of each template is
// documented next to it, and a template is meant to be passed straight to
// `PgDataSource.query(text, params)` / `PgDataSource.queryRead(text, params)`.
//
// Every statement produced here is written out with its own trailing semicolon,
// so a multi-statement script is built by joining the statements with a newline
// (`\n`) — the terminator stays part of each statement.
// ---------------------------------------------------------------------------

import type {
  PgBoolFilter,
  PgEqualsFilter,
  PgFilterCondition,
  PgInFilter,
  PgMatchFilter,
  PgRangeFilter,
} from './filter'
import type { PgSortCondition } from './sort'
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
 * A statement together with the values its placeholders bind.
 *
 * `sql` carries `$1 … $n` placeholders and `values[i - 1]` is the value of `$i`,
 * so the pair is passed straight to `PgDataSource.query(sql, values)` /
 * `PgDataSource.queryRead(sql, values)`.
 */
export interface PgSqlQuery {
  /** Statement text with `$1 … $n` placeholders. */
  sql: string
  /** One value per placeholder, in parameter order. */
  values: unknown[]
}

/** What {@link PgSqlTemplate.selectPage} reads a page by. */
export interface PgSelectPageOptions {
  /** Filter conditions driving the `WHERE` clause; omitted for no filter. */
  filter?: PgFilterCondition | null
  /** Sort condition driving the `ORDER BY` clause; omitted for no sort. */
  sort?: PgSortCondition | null
  /** Page size, bound to `LIMIT`. */
  limit: number
  /** Row offset of the first row of the page, bound to `OFFSET`. */
  offset: number
}

/**
 * Map every property of an entity to the column it is stored in.
 *
 * A filter condition names a column by either name — the property key a caller
 * writes in TypeScript (`createdAt`) or the column name as stored (`created_at`)
 * — while a statement can only reference the latter, so the map translates the
 * former to the latter. The key column is part of the map for the same reason.
 */
function columnNameMap(metadata: PgEntityMetadata): ReadonlyMap<string, string> {
  const map = new Map<string, string>([[metadata.key.propertyKey, metadata.key.column]])

  for (const column of metadata.columns) map.set(column.propertyKey, column.column)

  return map
}

/**
 * Resolve the name a filter carries to the column it selects.
 *
 * The name is either a property key of the entity (`createdAt`) or already the
 * column name (`created_at`): the map holds the former to the latter, and a name
 * the map does not know is used as written.
 */
function resolveFilterColumn(name: string, columns: ReadonlyMap<string, string>): string {
  return columns.get(name) ?? name
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

/**
 * Wrap a PostgreSQL identifier in double quotes.
 *
 * An identifier cannot be a bind parameter, so DDL interpolates it into the
 * statement. Quoting keeps the name out of the keyword namespace and preserves
 * its exact spelling instead of folding it to lower case. The metadata names
 * are already validated by the builder (see `assertValidPgName`), so no further
 * escaping is applied here.
 */
function quoteIdentifier(name: string): string {
  return `"${name}"`
}

/** Quote a value as a PostgreSQL string literal, doubling embedded quotes. */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Character that escapes `LIKE` metacharacters in a pattern.
 *
 * A backslash — also PostgreSQL's default escape character for `LIKE`. The
 * rendered clause states it explicitly (`ESCAPE '\'`), so the match does not
 * depend on the server default.
 */
const LIKE_ESCAPE = '\\'

/**
 * Escape the `LIKE` metacharacters of a value so it matches literally.
 *
 * `%` (any sequence), `_` (any single character) and the escape character
 * itself are prefixed with {@link LIKE_ESCAPE}. The three are replaced in one
 * pass, so a backslash cannot swallow the marks added for the other two: `a\b`
 * becomes `a\\b`, and `50%` becomes `50\%`. The value is bound as a parameter,
 * so this is about pattern semantics, not about SQL injection.
 */
function escapeLikeValue(value: string): string {
  return value.replace(/[\\%_]/g, character => `${LIKE_ESCAPE}${character}`)
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
   * value templates — it cannot be a bind parameter; it is quoted with
   * `quoteIdentifier` instead. `IF NOT EXISTS` makes the statement idempotent.
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
   * cannot be bind parameters, so the schema, table and column names are
   * quoted with `quoteIdentifier`.
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
   * Build the paged read statement for an entity, with its values.
   *
   * Shape: `SELECT … FROM <table> [WHERE …] [ORDER BY …] LIMIT $n OFFSET $n+1`.
   * The column list mirrors {@link PgSqlTemplate.selectRow}, so a paged read
   * returns the same row shape as the primary-key lookup. Both `filter` and
   * `sort` are optional: without a filter the `WHERE` clause is omitted, without
   * a sort — or with a multi-column sort that carries no columns — the
   * `ORDER BY` clause is omitted. The `LIMIT` / `OFFSET` clause is always
   * emitted and always closes the statement, with the page size and the row
   * offset bound as the last two parameters.
   *
   * Identifiers cannot be bind parameters, so the schema, table, column and sort
   * column names are quoted with `quoteIdentifier`, while the filter values and
   * the two paging values are bound positionally.
   *
   * The statement and its values are produced together and returned as one
   * {@link PgSqlQuery}: the filter values come first, in the order the rendered
   * clauses reference them, followed by `LIMIT` and `OFFSET`. Both halves are
   * built from one walk of the filter, so the placeholders cannot drift from the
   * value list.
   *
   * The total number of matching rows is a separate statement — see
   * {@link PgSqlTemplate.selectCount} — so paging and counting stay independent:
   * a caller can run either one, and the count does not depend on the page size.
   *
   * @param metadata The resolved entity metadata to build the statement from.
   * @param options  Filter, sort and paging of the page to read.
   */
  static selectPage(metadata: PgEntityMetadata, options: PgSelectPageOptions): PgSqlQuery {
    const tableRef = qualifyTable(metadata.schema, metadata.table)
    const columns = [metadata.key.column, ...metadata.columns.map(column => column.column)]
    const columnMap = columnNameMap(metadata)
    const values: unknown[] = []
    const where = options.filter
      ? PgSqlTemplate.renderFilter(options.filter, values, columnMap)
      : null
    const orderBy = options.sort ? PgSqlTemplate.renderSort(options.sort) : null

    const statements = [
      'SELECT',
      columns.map(column => `  ${quoteIdentifier(column)}`).join(',\n'),
      `FROM ${tableRef}`,
    ]

    if (where) statements.push(`WHERE ${where}`)
    if (orderBy) statements.push(`ORDER BY ${orderBy}`)

    // The paging values close both lists: they are the last placeholders of the
    // statement and the last entries of the value list.
    values.push(options.limit, options.offset)
    statements.push(`LIMIT $${values.length - 1} OFFSET $${values.length};`)

    return { sql: statements.join('\n'), values }
  }

  /**
   * Build the statement counting the rows an entity holds.
   *
   * Shape: `SELECT COUNT(*) FROM <table> [WHERE …];` — the same `WHERE` clause
   * the page statement renders, but no `ORDER BY`, `LIMIT` or `OFFSET`, so the
   * two can be combined to report a page and the total it pages through. The
   * filter is rendered exactly as {@link PgSqlTemplate.selectPage} renders it,
   * so its placeholders are numbered identically and the filter values apply to
   * either statement.
   *
   * @param metadata The resolved entity metadata to build the statement from.
   * @param filter   Optional filter conditions driving the `WHERE` clause.
   * @returns The count statement and one value per placeholder.
   */
  static selectCount(metadata: PgEntityMetadata, filter?: PgFilterCondition | null): PgSqlQuery {
    const tableRef = qualifyTable(metadata.schema, metadata.table)
    const values: unknown[] = []
    const where = filter
      ? PgSqlTemplate.renderFilter(filter, values, columnNameMap(metadata))
      : null

    const sql = where
      ? `SELECT COUNT(*) FROM ${tableRef}\nWHERE ${where};`
      : `SELECT COUNT(*) FROM ${tableRef};`

    return { sql, values }
  }

  /**
   * Render a filter condition as a SQL predicate.
   *
   * Dispatches on `kind` to the renderer of that shape; each renderer pushes the
   * values it references onto `values` in render order, and a value's
   * placeholder is the position it occupies in that list, so a clause and the
   * value list are numbered by the same walk.
   *
   * A filter names its column by property key or by column name; `columns` maps
   * the former to the latter (see {@link columnNameMap}), so a name it does not
   * hold is used as written.
   *
   * A shape that renders no predicate — a range with both bounds `null`, an
   * empty boolean group, a boolean group whose members all render nothing —
   * returns `null` so the caller omits it instead of emitting `WHERE` noise.
   *
   * @param filter  The filter condition to render.
   * @param values  The parameter list the placeholders are numbered against.
   * @param columns Property key to column name of the entity being read.
   */
  private static renderFilter(
    filter: PgFilterCondition,
    values: unknown[],
    columns: ReadonlyMap<string, string>,
  ): string | null {
    switch (filter.kind) {
      case 'equals':
        return PgSqlTemplate.renderEqualsFilter(filter, resolveFilterColumn(filter.name, columns), values)
      case 'in':
        return PgSqlTemplate.renderInFilter(filter, resolveFilterColumn(filter.name, columns), values)
      case 'range':
        return PgSqlTemplate.renderRangeFilter(filter, resolveFilterColumn(filter.name, columns), values)
      case 'match':
        return PgSqlTemplate.renderMatchFilter(filter, resolveFilterColumn(filter.name, columns), values)
      case 'bool':
        return PgSqlTemplate.renderBoolFilter(filter, values, columns)
    }
  }

  /**
   * Render an equality filter: `"column" = $n`.
   *
   * The compared value is pushed onto `values`, so the predicate always binds
   * exactly one parameter — `null` included, which renders `= $n` and therefore
   * never matches in SQL.
   *
   * @param filter The equality filter to render.
   * @param column The resolved column name to compare.
   * @param values The parameter list the placeholder is numbered against.
   */
  private static renderEqualsFilter(filter: PgEqualsFilter, column: string, values: unknown[]): string {
    values.push(filter.value)
    return `${quoteIdentifier(column)} = $${values.length}`
  }

  /**
   * Render a set filter: `"column" = ANY($n)`.
   *
   * The values bind as one array parameter — a list of numbers or a list of
   * strings (see `PgInValues`) — so the statement carries a single placeholder
   * whatever the size of the set, and the numbering of the parameters that
   * follow does not depend on it. PostgreSQL rewrites `IN (…)` into exactly this
   * form, so the clause matches the same rows; an empty list binds `'{}'`, which
   * matches nothing (`= ANY('{}')` is always false) without a `FALSE` special
   * case.
   *
   * @param filter The set filter to render.
   * @param column The resolved column name to compare.
   * @param values The parameter list the placeholder is numbered against.
   */
  private static renderInFilter(filter: PgInFilter, column: string, values: unknown[]): string {
    values.push([...filter.values])
    return `${quoteIdentifier(column)} = ANY($${values.length})`
  }

  /**
   * Render a range filter: `"column" >= $n AND "column" < $m`.
   *
   * Each bound is rendered only when it is not `null`, with the operator its
   * flag selects (`>` / `>=` below, `<` / `<=` above), so an open side adds no
   * predicate. A closed range is wrapped in parentheses to keep it a single
   * clause when it is combined with `AND` / `OR`; a single bound is emitted
   * bare. A range with both bounds `null` returns `null`, consuming no value.
   *
   * @param filter The range filter to render.
   * @param column The resolved column name to compare.
   * @param values The parameter list the placeholders are numbered against.
   */
  private static renderRangeFilter(filter: PgRangeFilter, column: string, values: unknown[]): string | null {
    const comparisons: string[] = []

    if (filter.minValue !== null) {
      values.push(filter.minValue)
      comparisons.push(`${quoteIdentifier(column)} ${filter.gt ? '>' : '>='} $${values.length}`)
    }
    if (filter.maxValue !== null) {
      values.push(filter.maxValue)
      comparisons.push(`${quoteIdentifier(column)} ${filter.lt ? '<' : '<='} $${values.length}`)
    }

    if (comparisons.length === 0) return null

    return comparisons.length === 1 ? comparisons[0]! : `(${comparisons.join(' AND ')})`
  }

  /**
   * Render a string matching filter: `"column" LIKE $n ESCAPE '\'`.
   *
   * The filter value names a literal substring, not a pattern: its `LIKE`
   * metacharacters (`%`, `_` and the backslash) are escaped by
   * {@link escapeLikeValue}, and the escaped value is bound wrapped in `%…%`, so
   * the clause matches every column that contains it. `ESCAPE '\'` is stated
   * explicitly, so the escape character does not depend on the server default.
   * The pattern is still a bind parameter — nothing is interpolated.
   *
   * @param filter The matching filter to render.
   * @param column The resolved column name to match.
   * @param values The parameter list the placeholder is numbered against.
   */
  private static renderMatchFilter(filter: PgMatchFilter, column: string, values: unknown[]): string {
    values.push(`%${escapeLikeValue(filter.value)}%`)
    return `${quoteIdentifier(column)} LIKE $${values.length} ESCAPE '\\'`
  }

  /**
   * Render a boolean grouping of filters.
   *
   * Members render in group order — `must` first, then `mustNot`, then
   * `should` — so parameters are numbered by that walk. `must` clauses are
   * joined with `AND`, `mustNot` clauses become `NOT (…)` and join the same
   * `AND` chain, and `should` clauses form one `OR` group in parentheses (an
   * empty `OR` list would match everything, so it is omitted entirely).
   * Members that render nothing are skipped. One clause is emitted bare and
   * several are wrapped in parentheses; an empty group returns `null`.
   *
   * @param filter  The boolean group to render.
   * @param values  The parameter list the placeholders are numbered against.
   * @param columns Property key to column name of the entity being read.
   */
  private static renderBoolFilter(
    filter: PgBoolFilter,
    values: unknown[],
    columns: ReadonlyMap<string, string>,
  ): string | null {
    const clauses: string[] = []

    for (const condition of filter.must) {
      const clause = PgSqlTemplate.renderFilter(condition, values, columns)
      if (clause) clauses.push(clause)
    }
    for (const condition of filter.mustNot) {
      const clause = PgSqlTemplate.renderFilter(condition, values, columns)
      if (clause) clauses.push(`NOT (${clause})`)
    }

    const should = filter.should
      .map(condition => PgSqlTemplate.renderFilter(condition, values, columns))
      .filter((clause): clause is string => clause !== null)

    if (should.length > 0) clauses.push(`(${should.join(' OR ')})`)
    if (clauses.length === 0) return null

    return clauses.length === 1 ? clauses[0]! : `(${clauses.join(' AND ')})`
  }

  /**
   * Render a sort condition as an `ORDER BY` term list.
   *
   * A multi-column sort keeps its columns in order; a multi-column sort with no
   * columns — and a single-column sort, which always carries one — is rendered
   * as a single term. Returns `null` when the condition contributes no term, so
   * the caller omits the `ORDER BY` clause. Sort terms are identifiers plus a
   * fixed `ASC` / `DESC` keyword, so they bind no value.
   *
   * @param sort The sort condition to render.
   */
  private static renderSort(sort: PgSortCondition): string | null {
    if (sort.kind === 'column') return `${quoteIdentifier(sort.name)} ${sort.order}`
    if (sort.sorts.length === 0) return null

    return sort.sorts.map(column => `${quoteIdentifier(column.name)} ${column.order}`).join(', ')
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
