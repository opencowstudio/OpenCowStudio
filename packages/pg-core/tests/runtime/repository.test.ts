import { describe, it, expect } from 'vitest'
import { PgRepositoryManager } from '../../src/runtime/repository'
import { PgSqlTemplate } from '../../src/runtime/sql'
import type { PgDataSourceManager, PgEntityMetadata } from '../../src/index'
import { column, entityWith } from '../fixtures/metadata'

/**
 * Build a datasource manager whose single datasource records the DDL statements
 * it is handed. Catalog reads answer with no rows — so every table is seen as
 * missing — and are not recorded, since they are introspection, not DDL.
 */
function recordingDataSources(statements: string[]): PgDataSourceManager {
  return {
    get: () => ({
      query: (text: string) => {
        if (!text.includes('information_schema.columns')) {
          statements.push(text)
        }
        return Promise.resolve({ rows: [] })
      },
    }),
  } as unknown as PgDataSourceManager
}

describe('PgRepositoryManager.createRepositories', () => {
  it('synchronizes the schemas and tables of every entity before building it', async () => {
    const statements: string[] = []
    const first = entityWith([column({ column: 'name', columnType: 'TEXT', default: '' })])
    // Building the repository of an entity also builds its UPDATE, which an
    // entity without a single column cannot produce, so this one declares a
    // column as well.
    const second: PgEntityMetadata = {
      ...entityWith([column({ column: 'name', columnType: 'TEXT', default: '' })]),
      table: 'other',
    }

    await new PgRepositoryManager(recordingDataSources(statements)).createRepositories([
      first,
      second,
    ])

    expect(statements).toEqual([
      // One script per database: both entities live in `public`, so the schema
      // is de-duplicated into a single CREATE SCHEMA.
      PgSqlTemplate.createSchema('public'),
      // Each missing table is recorded, then created.
      PgSqlTemplate.INSERT_SQL_EXECUTION_SCRIPT,
      PgSqlTemplate.createTable(first),
      PgSqlTemplate.INSERT_SQL_EXECUTION_SCRIPT,
      PgSqlTemplate.createTable(second),
    ])
  })
})
