import { describe, it, expect } from 'vitest'
import { SchemaSync } from '../../src/runtime/schema-sync'
import { PgSqlTemplate } from '../../src/runtime/sql'
import type { PgDataSourceManager } from '../../src/index'
import { column, definition, entityWith } from '../fixtures/metadata'

// `getColumnMismatches` is pure, so the datasource manager is never touched.
const sync = new SchemaSync({} as PgDataSourceManager)

/** One query handed to the datasource: the statement plus its bind parameters. */
interface RecordedQuery {
  text: string
  params?: unknown[]
}

/**
 * Build a service whose datasource records every query handed to `query`.
 * The code paths under test touch the datasource only through `executeScript`,
 * which records the script before executing it.
 */
function recordingSync(queries: RecordedQuery[]): SchemaSync {
  const dataSources = {
    get: () => ({
      query: (text: string, params?: unknown[]) => {
        queries.push({ text, params })
        return Promise.resolve({ rows: [] })
      },
    }),
  } as unknown as PgDataSourceManager
  return new SchemaSync(dataSources)
}

/** The statements of `queries`, in execution order. */
function textsOf(queries: RecordedQuery[]): string[] {
  return queries.map(query => query.text)
}

describe('SchemaSync.getColumnMismatches', () => {
  it('returns nothing when every declared column is consistent', () => {
    const entity = entityWith([
      column({ column: 'name', columnType: 'TEXT', default: '' }),
      column({ column: 'label', columnType: 'TEXT', default: 'hello' }),
      column({ column: 'age', columnType: 'INT', default: 0 }),
      column({ column: 'flag', columnType: 'BOOLEAN', default: false }),
      column({ column: 'data', columnType: 'JSON_OBJECT', default: {} }),
      column({ column: 'tags', columnType: 'JSON_ARRAY', default: [] }),
      column({ column: 'created', columnType: 'DATE', default: null }),
    ])

    const definitions = [
      // The key column is reported by the catalog but not a PgColumnMetadata.
      definition('id', 'int8', "nextval('sample_id_seq'::regclass)"),
      definition('name', 'text', "''::text"),
      definition('label', 'text', "'hello'::text"),
      definition('age', 'int4', '0'),
      definition('flag', 'bool', 'false'),
      definition('data', 'jsonb', "'{}'::jsonb"),
      definition('tags', 'jsonb', "'[]'::jsonb"),
      definition('created', 'timestamptz', null),
    ]

    expect(sync.getColumnMismatches(entity, definitions)).toEqual([])
  })

  it('reports a declared column missing from the catalog', () => {
    const ghost = column({ column: 'ghost', columnType: 'TEXT', default: '' })
    const entity = entityWith([ghost])

    expect(sync.getColumnMismatches(entity, [])).toEqual([
      { column: 'ghost', columnMetadata: ghost, kind: 'missing', expected: null, actual: null },
    ])
  })

  it('reports a catalog type that differs from the mapped udt_name', () => {
    const age = column({ column: 'age', columnType: 'INT', default: 0 })
    const entity = entityWith([age])

    expect(sync.getColumnMismatches(entity, [definition('age', 'int8', '0')])).toEqual([
      { column: 'age', columnMetadata: age, kind: 'type', expected: 'int4', actual: 'int8' },
    ])
  })

  it('reports a differing default and treats a null side as "no default"', () => {
    const age = column({ column: 'age', columnType: 'INT', default: 0 })
    const data = column({ column: 'data', columnType: 'JSON_OBJECT', default: {} })
    const entity = entityWith([age, data])

    const definitions = [
      definition('age', 'int4', '1'),
      definition('data', 'jsonb', null),
    ]

    expect(sync.getColumnMismatches(entity, definitions)).toEqual([
      { column: 'age', columnMetadata: age, kind: 'default', expected: '0', actual: '1' },
      { column: 'data', columnMetadata: data, kind: 'default', expected: "'{}'", actual: null },
    ])
  })

  it('reports both a type and a default mismatch for the same column', () => {
    const amount = column({ column: 'amount', columnType: 'DOUBLE', default: 1.5 })
    const entity = entityWith([amount])
    const definitions = [definition('amount', 'int4', '2')]

    expect(sync.getColumnMismatches(entity, definitions)).toEqual([
      { column: 'amount', columnMetadata: amount, kind: 'type', expected: 'float8', actual: 'int4' },
      { column: 'amount', columnMetadata: amount, kind: 'default', expected: '1.5', actual: '2' },
    ])
  })

  it('ignores catalog columns the entity does not declare', () => {
    const entity = entityWith([column({ column: 'name', columnType: 'TEXT', default: '' })])
    const definitions = [
      definition('id', 'int8', "nextval('sample_id_seq'::regclass)"),
      definition('name', 'text', "''::text"),
      definition('legacy', 'text', null),
    ]

    expect(sync.getColumnMismatches(entity, definitions)).toEqual([])
  })
})

describe('SchemaSync.ensureColumns', () => {
  it('sends nothing when every declared column is consistent', async () => {
    const queries: RecordedQuery[] = []
    const entity = entityWith([column({ column: 'name', columnType: 'TEXT', default: '' })])
    const definitions = [definition('name', 'text', "''::text")]

    await recordingSync(queries).ensureColumns(entity, definitions)

    expect(queries).toEqual([])
  })

  it('records the script before executing it', async () => {
    const queries: RecordedQuery[] = []
    const ghost = column({ column: 'ghost', columnType: 'INT', default: 0 })
    const entity = entityWith([ghost])

    await recordingSync(queries).ensureColumns(entity, [])

    const addColumn = PgSqlTemplate.addColumn('public', 'sample', ghost)
    const [record, script] = queries

    expect(record!.text).toBe(PgSqlTemplate.INSERT_SQL_EXECUTION_SCRIPT)
    // `$1` = id, `$2` = table_name, `$3` = script_content, `$4` = created_at.
    expect(record!.params![0]).toEqual(expect.any(String))
    expect(record!.params!.slice(1)).toEqual(['public.sample', addColumn, expect.any(Date)])
    expect(script!.text).toBe(addColumn)
  })

  it('adds a column that is missing from the table', async () => {
    const queries: RecordedQuery[] = []
    const ghost = column({ column: 'ghost', columnType: 'INT', default: 0 })
    const entity = entityWith([ghost])

    await recordingSync(queries).ensureColumns(entity, [])

    expect(textsOf(queries)).toEqual([
      PgSqlTemplate.INSERT_SQL_EXECUTION_SCRIPT,
      PgSqlTemplate.addColumn('public', 'sample', ghost),
    ])
  })

  it('aligns the type before the default of a diverging column', async () => {
    const queries: RecordedQuery[] = []
    const amount = column({ column: 'amount', columnType: 'DOUBLE', default: 1.5 })
    const entity = entityWith([amount])
    const definitions = [definition('amount', 'int4', '2')]

    await recordingSync(queries).ensureColumns(entity, definitions)

    expect(textsOf(queries)).toEqual([
      PgSqlTemplate.INSERT_SQL_EXECUTION_SCRIPT,
      [
        PgSqlTemplate.alterColumnType('public', 'sample', amount),
        PgSqlTemplate.alterColumnDefault('public', 'sample', amount),
      ].join('\n'),
    ])
  })
})

describe('SchemaSync.ensureTable', () => {
  it('reconciles the columns of an existing table', async () => {
    const queries: RecordedQuery[] = []
    const ghost = column({ column: 'ghost', columnType: 'INT', default: 0 })
    const entity = entityWith([ghost])
    // The catalog reports the key column only, so `ghost` is missing.
    const dataSources = {
      get: () => ({
        query: (text: string, params?: unknown[]) => {
          if (text.includes('information_schema.columns')) {
            return Promise.resolve({
              rows: [{ column_name: 'id', udt_name: 'int8', column_default: null }],
            })
          }
          queries.push({ text, params })
          return Promise.resolve({ rows: [] })
        },
      }),
    } as unknown as PgDataSourceManager

    await new SchemaSync(dataSources).ensureTable(entity)

    expect(textsOf(queries)).toEqual([
      PgSqlTemplate.INSERT_SQL_EXECUTION_SCRIPT,
      PgSqlTemplate.addColumn('public', 'sample', ghost),
    ])
  })
})
