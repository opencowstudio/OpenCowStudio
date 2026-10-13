import { describe, it, expect } from 'vitest'
import { PgRepositoryManager } from '../../src/runtime/repository'
import { PgSqlTemplate } from '../../src/runtime/sql'
import type {
  PgColumnDefinition,
  PgColumnMetadata,
  PgDataSourceManager,
  PgEntityMetadata,
} from '../../src/index'

// `getColumnMismatches` is pure, so the datasource manager is never touched.
const manager = new PgRepositoryManager({} as PgDataSourceManager)

/**
 * Build a manager whose datasource records every script handed to `query`.
 * `ensureColumns` is the only code path under test that touches the datasource.
 */
function recordingManager(scripts: string[]): PgRepositoryManager {
  const dataSources = {
    get: () => ({
      query: (text: string) => {
        scripts.push(text)
        return Promise.resolve({ rows: [] })
      },
    }),
  } as unknown as PgDataSourceManager
  return new PgRepositoryManager(dataSources)
}

/** Build the minimal entity metadata carrying `columns`. */
function entityWith(columns: PgColumnMetadata[]): PgEntityMetadata {
  return {
    dbName: 'default',
    schema: 'public',
    table: 'sample',
    comment: '',
    createTableAuto: true,
    addColumnAuto: true,
    createIndexAuto: true,
    indexes: [],
    key: { propertyKey: 'id', column: 'id', generated: false, comment: '', columnType: 'BIGINT' },
    columns,
  }
}

/** Build a declared column, overriding only the fields under test. */
function column(overrides: Partial<PgColumnMetadata>): PgColumnMetadata {
  return { propertyKey: 'p', column: 'c', comment: '', columnType: 'TEXT', default: null, ...overrides }
}

/** Build a catalog row. */
function definition(
  columnName: string,
  udtName: string,
  columnDefault: string | null,
): PgColumnDefinition {
  return { columnName, udtName, columnDefault }
}

describe('PgRepositoryManager.getColumnMismatches', () => {
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

    expect(manager.getColumnMismatches(entity, definitions)).toEqual([])
  })

  it('reports a declared column missing from the catalog', () => {
    const ghost = column({ column: 'ghost', columnType: 'TEXT', default: '' })
    const entity = entityWith([ghost])

    expect(manager.getColumnMismatches(entity, [])).toEqual([
      { column: 'ghost', columnMetadata: ghost, kind: 'missing', expected: null, actual: null },
    ])
  })

  it('reports a catalog type that differs from the mapped udt_name', () => {
    const age = column({ column: 'age', columnType: 'INT', default: 0 })
    const entity = entityWith([age])

    expect(manager.getColumnMismatches(entity, [definition('age', 'int8', '0')])).toEqual([
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

    expect(manager.getColumnMismatches(entity, definitions)).toEqual([
      { column: 'age', columnMetadata: age, kind: 'default', expected: '0', actual: '1' },
      { column: 'data', columnMetadata: data, kind: 'default', expected: "'{}'", actual: null },
    ])
  })

  it('reports both a type and a default mismatch for the same column', () => {
    const amount = column({ column: 'amount', columnType: 'DOUBLE', default: 1.5 })
    const entity = entityWith([amount])
    const definitions = [definition('amount', 'int4', '2')]

    expect(manager.getColumnMismatches(entity, definitions)).toEqual([
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

    expect(manager.getColumnMismatches(entity, definitions)).toEqual([])
  })
})

describe('PgRepositoryManager.ensureColumns', () => {
  it('sends nothing when every declared column is consistent', async () => {
    const scripts: string[] = []
    const entity = entityWith([column({ column: 'name', columnType: 'TEXT', default: '' })])
    const definitions = [definition('name', 'text', "''::text")]

    await recordingManager(scripts).ensureColumns(entity, definitions)

    expect(scripts).toEqual([])
  })

  it('adds a column that is missing from the table', async () => {
    const scripts: string[] = []
    const ghost = column({ column: 'ghost', columnType: 'INT', default: 0 })
    const entity = entityWith([ghost])

    await recordingManager(scripts).ensureColumns(entity, [])

    expect(scripts).toEqual([PgSqlTemplate.addColumn('public', 'sample', ghost)])
  })

  it('aligns the type before the default of a diverging column', async () => {
    const scripts: string[] = []
    const amount = column({ column: 'amount', columnType: 'DOUBLE', default: 1.5 })
    const entity = entityWith([amount])
    const definitions = [definition('amount', 'int4', '2')]

    await recordingManager(scripts).ensureColumns(entity, definitions)

    expect(scripts).toEqual([
      [
        PgSqlTemplate.alterColumnType('public', 'sample', amount),
        PgSqlTemplate.alterColumnDefault('public', 'sample', amount),
      ].join('\n'),
    ])
  })
})

describe('PgRepositoryManager.ensureTable', () => {
  it('reconciles the columns of an existing table', async () => {
    const scripts: string[] = []
    const ghost = column({ column: 'ghost', columnType: 'INT', default: 0 })
    const entity = entityWith([ghost])
    // The catalog reports the key column only, so `ghost` is missing.
    const dataSources = {
      get: () => ({
        query: (text: string) => {
          if (text.includes('information_schema.columns')) {
            return Promise.resolve({
              rows: [{ column_name: 'id', udt_name: 'int8', column_default: null }],
            })
          }
          scripts.push(text)
          return Promise.resolve({ rows: [] })
        },
      }),
    } as unknown as PgDataSourceManager

    await new PgRepositoryManager(dataSources).ensureTable(entity)

    expect(scripts).toEqual([PgSqlTemplate.addColumn('public', 'sample', ghost)])
  })
})
