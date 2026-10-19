// ---------------------------------------------------------------------------
// Storage bootstrap — schema, table, column and index synchronization (runtime)
//
// `SchemaSync` owns the DDL the runtime applies *before* any repository exists:
// it reads the PostgreSQL catalog, compares it with the entity metadata and
// brings the storage in line. It never creates a connection of its own — the
// `PgDataSourceManager` handed to the constructor is the single source of
// pools, and every query goes through it.
//
// The flow is: ensure every schema the entities live in exists
// (`ensureSchemas`), so a table can assume its schema is already there, then
// ensure each entity's table (`ensureTable`) — which creates it when it is
// missing and reconciles its columns and indexes when it is not. Every script
// is recorded before it runs (see `executeScript`).
//
// Repository creation itself is not this module's concern; it lives in
// `repository.ts`, which drives `SchemaSync` and then builds the repositories.
//
// Entity metadata resolution lives in `builder/parser.ts` (`parsePgEntity` /
// `parsePgEntities`), which is build-time only.
// ---------------------------------------------------------------------------

import { consola } from 'consola'
import { generateId } from '@opencowstudio/core'
import { PgSqlTemplate, columnDefaultExpression, indexName } from './sql'
import { camelizeKeys } from '../shared/naming.ts'
import type { PgDataSourceManager } from './datasource'
import type { ColumnMetadata, ColumnType, EntityMetadata } from '../shared/types.ts'

// Tagged logger so the core stays framework-agnostic (no Nuxt dep).
const logger = consola.withTag('pg-schema-sync')

/**
 * One column of a table as reported by the PostgreSQL catalog.
 *
 * Mirrors the columns selected by `PgSqlTemplate.COLUMN_DEFINITIONS`. The
 * catalog returns snake_case column aliases; they are converted to camelCase
 * by `camelizeKeys` (see `shared/naming.ts`) before the row is typed, so the
 * property names follow the JavaScript convention.
 */
export interface PgColumnDefinition {
  /** column name */
  columnName: string
  /** underlying type name, e.g. `float8`, `timestamptz` */
  udtName: string
  /** column default expression, or `null` when the column has none */
  columnDefault: string | null
}

/**
 * One index of a table as reported by the PostgreSQL catalog.
 *
 * Mirrors the columns selected by `PgSqlTemplate.INDEX_DEFINITIONS`. The
 * catalog returns snake_case column aliases; they are converted to camelCase
 * by `camelizeKeys` (see `shared/naming.ts`) before the row is typed, so the
 * property names follow the JavaScript convention.
 */
export interface PgIndexDefinition {
  /** index name */
  indexName: string
  /** full `CREATE INDEX …` statement the index was created with */
  indexDef: string
}

/**
 * Which aspect of a declared column diverges from its catalog definition.
 *
 *  * `missing` — the column is declared by the entity but absent from the table;
 *  * `type`    — the column exists but its catalog `udt_name` is not the one its
 *                logical `ColumnType` maps to;
 *  * `default` — the column exists but its catalog default differs from the one
 *                the entity declares.
 */
export type PgColumnMismatchKind = 'missing' | 'type' | 'default'

/**
 * One divergence between a declared column and its catalog definition.
 *
 * `expected` is the value the entity metadata declares and `actual` the value
 * the catalog reports; both are rendered as strings so they can be compared and
 * logged directly. For a `missing` column there is no catalog row, so both are
 * `null`. On the `default` kind, `null` on either side means "no default" (the
 * column has no `DEFAULT` clause).
 */
export interface PgColumnMismatch {
  /** the declared column name the two sides are matched on */
  column: string
  /** the declared column metadata the divergence originates from */
  columnMetadata: ColumnMetadata
  /** the aspect that diverges */
  kind: PgColumnMismatchKind
  /** value declared by the entity metadata, or `null` when not applicable */
  expected: string | null
  /** value reported by the catalog, or `null` when not applicable */
  actual: string | null
}

/**
 * PostgreSQL catalog type (`udt_name`) each logical `ColumnType` is stored as.
 *
 * Mirrors the column types emitted by {@link PgSqlTemplate.createTable}: an
 * `INTEGER` column reports `int4`, a `DOUBLE PRECISION` one `float8`, a `JSONB`
 * one `jsonb` (for both JSON types) and a `TIMESTAMPTZ` one `timestamptz`.
 */
const COLUMN_TYPE_UDT_NAME: Record<ColumnType, string> = {
  BIGINT: 'int8',
  INT: 'int4',
  DOUBLE: 'float8',
  BOOLEAN: 'bool',
  JSON_OBJECT: 'jsonb',
  JSON_ARRAY: 'jsonb',
  TEXT: 'text',
  DATE: 'timestamptz',
}

/**
 * Reduce a catalog `column_default` to a value comparable with the declared one.
 *
 * PostgreSQL renders a column default as its expression followed by an explicit
 * cast, e.g. `'{}'::jsonb` or `'hello'::text`; only the part before the first
 * `::` is kept. A `null` default (the column has no `DEFAULT`) passes through.
 */
function bareColumnDefault(columnDefault: string | null): string | null {
  if (columnDefault === null) return null
  const cast = columnDefault.indexOf('::')
  return cast === -1 ? columnDefault : columnDefault.slice(0, cast)
}

/**
 * Render a declared column default as the literal PostgreSQL stores.
 *
 * The literal itself is built by {@link columnDefaultExpression}, the same
 * renderer the runtime uses to write the column's `DEFAULT` clause, so the two
 * agree by construction (a `JSON_OBJECT` default of `{}` renders as `'{}'`, the
 * shape the catalog reports). Only the empty result is normalised here: it means
 * the column declares no default (`null` / `undefined` / `Date`) and becomes
 * `null` to match the catalog's `null`.
 */
function declaredColumnDefault(column: ColumnMetadata): string | null {
  return columnDefaultExpression(column.default) || null
}

// ---------------------------------------------------------------------------
// SchemaSync — the storage bootstrap service
//
// Stateless between calls: every method reads the catalog, decides and applies
// DDL. The datasource registry is the only dependency, so the service is a thin
// orchestrator over `PgSqlTemplate` and `PgDataSourceManager`.
// ---------------------------------------------------------------------------

/**
 * Storage bootstrap for the entities the runtime is configured with.
 *
 * Depends on the {@link PgDataSourceManager} at construction time and resolves
 * each entity's datasource through it via the entity's `dbName`.
 */
export class SchemaSync {
  private readonly dataSources: PgDataSourceManager

  constructor(dataSources: PgDataSourceManager) {
    this.dataSources = dataSources
  }

  /**
   * Read the column definitions of an entity's table.
   *
   * Runs {@link PgSqlTemplate.COLUMN_DEFINITIONS} against the entity's
   * datasource, binding the entity's schema and table. The query targets the
   * master node so the result reflects any DDL already applied during the same
   * bootstrap, rather than a possibly lagging replica.
   *
   * Returns one row per column in declaration order (the catalog is ordered by
   * `ordinal_position`), or an empty array when the table does not exist yet.
   *
   * The catalog returns snake_case column aliases; every row is run through
   * `snakeToCamel` so the result matches {@link PgColumnDefinition}'s camelCase
   * property names.
   *
   * @param entity The entity metadata whose table is introspected.
   */
  async getColumnDefinitions(entity: EntityMetadata): Promise<PgColumnDefinition[]> {
    const result = (await this.dataSources
      .get(entity.dbName)
      .query(PgSqlTemplate.COLUMN_DEFINITIONS, [entity.schema, entity.table])) as {
      rows: Record<string, unknown>[]
    }

    return result.rows.map(row => camelizeKeys<PgColumnDefinition>(row))
  }

  /**
   * Read the index definitions of an entity's table.
   *
   * Runs {@link PgSqlTemplate.INDEX_DEFINITIONS} against the entity's
   * datasource, binding the entity's schema and table. The query targets the
   * master node so the result reflects any DDL already applied during the same
   * bootstrap, rather than a possibly lagging replica.
   *
   * Returns one row per index (the catalog is ordered by `indexname`), or an
   * empty array when the table has no index — which includes the case where the
   * table does not exist yet.
   *
   * The catalog returns snake_case column aliases; every row is run through
   * `snakeToCamel` so the result matches {@link PgIndexDefinition}'s camelCase
   * property names.
   *
   * @param entity The entity metadata whose table is introspected.
   */
  async getIndexDefinitions(entity: EntityMetadata): Promise<PgIndexDefinition[]> {
    const result = (await this.dataSources
      .get(entity.dbName)
      .query(PgSqlTemplate.INDEX_DEFINITIONS, [entity.schema, entity.table])) as {
      rows: Record<string, unknown>[]
    }

    return result.rows.map(row => camelizeKeys<PgIndexDefinition>(row))
  }

  /**
   * Compare an entity's declared columns with a table's catalog definition.
   *
   * Every column of `entity.columns` is matched against `definitions` by name
   * and reported when the two diverge:
   *
   *  * the column has no catalog definition at all (`missing`);
   *  * its catalog `udt_name` is not the one its `ColumnType` maps to
   *    (`type`) — see {@link COLUMN_TYPE_UDT_NAME};
   *  * its catalog default differs from the declared one (`default`): the
   *    catalog cast is dropped and the declared default is rendered as the
   *    literal that was written, so `'{}'::jsonb` compares equal to a
   *    `JSON_OBJECT` default of `{}`, and a `null` on either side means "no
   *    default".
   *
   * One column can yield both a `type` and a `default` mismatch, and the result
   * may hold several entries in total. Every entry carries the declared
   * `ColumnMetadata` it was derived from (`columnMetadata`). The comparison is
   * one-directional:
   * catalog columns the entity does not declare as a `ColumnMetadata` — the
   * key column in particular — are ignored. The returned array is empty when
   * every declared column is consistent.
   *
   * @param entity The entity metadata whose declared columns are checked.
   * @param definitions The catalog definition to check them against, as returned
   * by {@link SchemaSync.getColumnDefinitions}.
   */
  getColumnMismatches(
    entity: EntityMetadata,
    definitions: PgColumnDefinition[],
  ): PgColumnMismatch[] {
    const byName = new Map(definitions.map(definition => [definition.columnName, definition]))
    const mismatches: PgColumnMismatch[] = []

    for (const column of entity.columns) {
      const definition = byName.get(column.column)
      if (!definition) {
        mismatches.push({
          column: column.column,
          columnMetadata: column,
          kind: 'missing',
          expected: null,
          actual: null,
        })
        continue
      }

      const expectedUdtName = COLUMN_TYPE_UDT_NAME[column.columnType]
      if (definition.udtName !== expectedUdtName) {
        mismatches.push({
          column: column.column,
          columnMetadata: column,
          kind: 'type',
          expected: expectedUdtName,
          actual: definition.udtName,
        })
      }

      const expectedDefault = declaredColumnDefault(column)
      const actualDefault = bareColumnDefault(definition.columnDefault)
      if (expectedDefault !== actualDefault) {
        mismatches.push({
          column: column.column,
          columnMetadata: column,
          kind: 'default',
          expected: expectedDefault,
          actual: actualDefault,
        })
      }
    }

    return mismatches
  }

  /**
   * Execute a SQL script against an entity's datasource, recording it first.
   *
   * Every table, column and index script goes through here — see
   * {@link SchemaSync.ensureTable}, {@link SchemaSync.ensureColumns} and
   * {@link SchemaSync.ensureIndex} — so the DDL applied at boot leaves an audit
   * trail. The script is written to `sql_execution_script` through
   * {@link PgSqlTemplate.INSERT_SQL_EXECUTION_SCRIPT} before it is run: one row
   * per execution, keyed by a fresh `generateId` value, tagged with the entity's
   * schema-qualified table (`<schema>.<table>`) and stamped with the current
   * time. The order matters — the record is committed on its own query, so a
   * script that fails is still on record.
   *
   * @param entity The entity metadata the script belongs to; its `dbName`
   * resolves the datasource and its `schema` / `table` are recorded as
   * `table_name`.
   * @param script The complete script to record and execute; every statement
   * already ends with `;`, so it is sent as one parameterless query.
   */
  async executeScript(entity: EntityMetadata, script: string): Promise<void> {
    const dataSource = this.dataSources.get(entity.dbName)

    await dataSource.query(PgSqlTemplate.INSERT_SQL_EXECUTION_SCRIPT, [
      generateId(),
      `${entity.schema}.${entity.table}`,
      script,
      new Date(),
    ])
    await dataSource.query(script)
  }

  /**
   * Bring an existing table's columns in line with the entity's declaration.
   *
   * The declared columns are compared with `definitions` first (see
   * {@link SchemaSync.getColumnMismatches}); when nothing diverges the method is
   * a no-op. Otherwise every mismatch contributes one statement:
   *
   *  * `missing` — the column is added by {@link PgSqlTemplate.addColumn}, which
   *    carries the declared type, default and comment;
   *  * `type`    — the column type is changed by
   *    {@link PgSqlTemplate.alterColumnType};
   *  * `default` — the column default is set or dropped by
   *    {@link PgSqlTemplate.alterColumnDefault}.
   *
   * The statements are joined into one script (each already ends with `;`) and
   * executed through {@link SchemaSync.executeScript}, so the script is recorded
   * before it runs and is applied over one connection in one round trip — and,
   * being a simple query, inside one implicit transaction. The mismatches come
   * back in declaration order, with a column's `type` statement preceding its
   * `default` one, so a column that needs both is altered to its declared shape
   * before the default is applied.
   *
   * @param entity The entity metadata whose columns are ensured.
   * @param definitions The catalog definition to reconcile against, as returned
   * by {@link SchemaSync.getColumnDefinitions}.
   */
  async ensureColumns(entity: EntityMetadata, definitions: PgColumnDefinition[]): Promise<void> {
    const label = `"${entity.schema}"."${entity.table}"`
    const mismatches = this.getColumnMismatches(entity, definitions)
    if (mismatches.length === 0) {
      logger.success(`Database "${entity.dbName}": columns of ${label} are up to date`)
      return
    }

    const statements = mismatches.map(mismatch => {
      const column = mismatch.columnMetadata
      switch (mismatch.kind) {
        case 'missing':
          return PgSqlTemplate.addColumn(entity.schema, entity.table, column)
        case 'type':
          return PgSqlTemplate.alterColumnType(entity.schema, entity.table, column)
        case 'default':
          return PgSqlTemplate.alterColumnDefault(entity.schema, entity.table, column)
      }
    })

    logger.info(
      `Database "${entity.dbName}": aligning ${statements.length} column(s) of ${label} ...`,
    )
    await this.executeScript(entity, statements.join('\n'))
    logger.success(`Database "${entity.dbName}": columns of ${label} aligned`)
  }

  /**
   * Ensure the indexes declared by an entity exist on its table.
   *
   * When the entity declares no index, the method is a no-op. Otherwise the
   * table's existing indexes are read first (see
   * {@link SchemaSync.getIndexDefinitions}) and every declared index is matched
   * against them by name: the name is derived deterministically from the table
   * and the index columns (see `indexName`), so it is stable across boots. A
   * declared index whose name is absent from the catalog contributes one
   * statement built by {@link PgSqlTemplate.createIndex}, which carries the
   * declared access method — a `unique` index becomes `CREATE UNIQUE INDEX`, a
   * `gin` index a `USING gin` one using the `gin_trgm_ops` class.
   *
   * The statements are joined into one script (each already ends with `;`) and
   * executed through {@link SchemaSync.executeScript}, so the script is recorded
   * before it runs and is applied over one connection in one round trip. The
   * method is a no-op when every declared index already exists.
   *
   * @param entity The entity metadata whose indexes are ensured.
   */
  async ensureIndex(entity: EntityMetadata): Promise<void> {
    if (entity.indexes.length === 0) return

    const label = `"${entity.schema}"."${entity.table}"`
    const existing = await this.getIndexDefinitions(entity)
    const existingNames = new Set(existing.map(definition => definition.indexName))

    const statements = entity.indexes
      .filter(index => !existingNames.has(indexName(entity.table, index)))
      .map(index => PgSqlTemplate.createIndex(entity.schema, entity.table, index))

    if (statements.length === 0) {
      logger.success(`Database "${entity.dbName}": indexes of ${label} are up to date`)
      return
    }

    logger.info(
      `Database "${entity.dbName}": creating ${statements.length} index(es) on ${label} ...`,
    )
    await this.executeScript(entity, statements.join('\n'))
    logger.success(`Database "${entity.dbName}": indexes of ${label} aligned`)
  }

  /**
   * Ensure the table backing an entity exists and its columns match the entity.
   *
   * Introspects the entity's table first (see
   * {@link SchemaSync.getColumnDefinitions}): when it already has columns, the
   * table is left as-is and its columns are reconciled with the entity through
   * {@link SchemaSync.ensureColumns}, followed by its indexes through
   * {@link SchemaSync.ensureIndex}. Otherwise the table is created from
   * {@link PgSqlTemplate.createTable}, recorded and executed through
   * {@link SchemaSync.executeScript} — the statement is `CREATE TABLE IF NOT
   * EXISTS`, so it stays safe if the table appears in between.
   *
   * @param entity The entity metadata whose table is ensured.
   */
  async ensureTable(entity: EntityMetadata): Promise<void> {
    const label = `"${entity.schema}"."${entity.table}"`
    logger.info(`Database "${entity.dbName}": ensuring table ${label} ...`)

    const existing = await this.getColumnDefinitions(entity)
    if (existing.length > 0) {
      logger.success(`Database "${entity.dbName}": table ${label} already exists`)
      await this.ensureColumns(entity, existing)
      await this.ensureIndex(entity)
      return
    }

    await this.executeScript(entity, PgSqlTemplate.createTable(entity))
    logger.success(`Database "${entity.dbName}": table ${label} created`)
  }

  /**
   * Ensure every schema referenced by `entities` exists.
   *
   * The entities are grouped by `dbName` and the schema names within a database
   * are de-duplicated, so each datasource receives exactly one script that
   * creates all of its missing schemas. Every statement is idempotent, and the
   * script is sent as a single parameterless query, so it is applied over one
   * connection in one round trip.
   *
   * @param entities The resolved entity metadata to collect schemas from.
   */
  async ensureSchemas(entities: EntityMetadata[]): Promise<void> {
    // dbName -> ordered, de-duplicated schema names.
    const schemasByDatabase = new Map<string, Set<string>>()
    for (const entity of entities) {
      let schemas = schemasByDatabase.get(entity.dbName)
      if (!schemas) {
        schemas = new Set<string>()
        schemasByDatabase.set(entity.dbName, schemas)
      }
      schemas.add(entity.schema)
    }

    for (const [dbName, schemas] of schemasByDatabase) {
      const names = [...schemas]
      // Each template already ends with `;`, so the script only needs the
      // statements joined with a newline.
      const script = names.map(schema => PgSqlTemplate.createSchema(schema)).join('\n')
      logger.info(`Database "${dbName}": ensuring schemas [${names.join(', ')}] ...`)
      await this.dataSources.get(dbName).query(script)
      logger.success(`Database "${dbName}": schemas ready [${names.join(', ')}]`)
    }
  }
}
