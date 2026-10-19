import { describe, it, expect } from 'vitest'
import { PgRepositories, PgRepositoryManager } from '../../src/runtime/repository'
import { PgSqlTemplate } from '../../src/runtime/sql'
import { PgTableRepository } from '../../src/runtime/table-repository'
import type { PgDataSourceManager, EntityMetadata } from '../../src/index'
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
    const second: EntityMetadata = {
      ...entityWith([column({ column: 'name', columnType: 'TEXT', default: '' })]),
      className: 'Other',
      table: 'other',
    }

    await new PgRepositoryManager(recordingDataSources(statements)).createRepositories(
      [first, second],
      { Sample: class Sample {}, Other: class Other {} },
    )

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

  it('fails when an entity has no class in the entity type map', async () => {
    const entity = entityWith([column({ column: 'name', columnType: 'TEXT', default: '' })])

    await expect(
      new PgRepositoryManager(recordingDataSources([])).createRepositories([entity], {}),
    ).rejects.toThrow('No entity class found for "Sample" (table "sample") in the entity type map.')
  })
})

describe('PgRepositories.get', () => {
  it('returns the repository registered for an entity class', async () => {
    const entity = entityWith([column({ column: 'name', columnType: 'TEXT', default: '' })])
    class Registered {}

    await new PgRepositoryManager(recordingDataSources([])).createRepositories([entity], {
      Sample: Registered,
    })

    expect(new PgRepositories().get(Registered)).toBeInstanceOf(PgTableRepository)
  })

  it('fails when no repository is registered for the entity class', () => {
    class Unscanned {}

    expect(() => new PgRepositories().get(Unscanned)).toThrow(
      'No repository registered for entity "Unscanned".',
    )
  })
})
