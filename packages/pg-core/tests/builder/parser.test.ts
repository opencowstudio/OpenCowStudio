/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { parsePgEntities } from '../../src/builder'
import type { PgEntityMetadata } from '../../src'

const entitiesDir = fileURLToPath(new URL('../fixtures/entities/', import.meta.url))
const entity = (name: string) => `${entitiesDir}${name}`

/** Parse a single entity fixture file and return its one PgEntityMetadata. */
function parseOne(name: string): PgEntityMetadata {
  const metas = parsePgEntities([entity(name)])
  if (metas.length !== 1) {
    throw new Error(`expected exactly one entity in ${name}, got ${metas.length}`)
  }
  return metas[0]!
}

describe('builder parser — parsePgEntities (resolution)', () => {
  it('should read the decorator options from source and resolve them', () => {
    const meta = parseOne('raw.ts')
    expect(meta.dbName).toBe('my_db')
    expect(meta.schema).toBe('app')
    expect(meta.table).toBe('my_tbl')
    // an explicit boolean option is read from source
    expect(meta.createTableAuto).toBe(false)
    // omitted booleans fall back to their defaults
    expect(meta.addColumnAuto).toBe(true)
    expect(meta.createIndexAuto).toBe(true)
    expect(meta.key).toEqual({ propertyKey: 'id', column: 'id', generated: false, comment: '' })
    expect(meta.columns).toEqual([
      { propertyKey: 'name', column: 'name', comment: 'a comment', columnType: 'TEXT' },
    ])
  })

  it('should read every explicit boolean option', () => {
    const meta = parseOne('bool-entity.ts')
    expect(meta.createTableAuto).toBe(false)
    expect(meta.addColumnAuto).toBe(false)
    expect(meta.createIndexAuto).toBe(true)
    expect(meta.key.generated).toBe(false)
  })

  it('should fill defaults when boolean options are omitted', () => {
    const meta = parseOne('default-bool.ts')
    expect(meta.createTableAuto).toBe(true)
    expect(meta.addColumnAuto).toBe(true)
    expect(meta.createIndexAuto).toBe(true)
    expect(meta.key.generated).toBe(true)
  })

  it('should derive the default table and column names in snake_case', () => {
    const meta = parseOne('snake-case.ts')
    expect(meta.dbName).toBe('default')
    expect(meta.schema).toBe('public')
    expect(meta.table).toBe('snake_case')
    // the key column is always 'id', regardless of the property name
    expect(meta.key.column).toBe('id')
    expect(meta.columns.map(c => c.column).sort()).toEqual([
      'display_name',
      'first_name',
      'http_status_code',
      'last_name',
      'user_id',
    ])
  })

  it('should resolve the indexes declared on @PgEntity into index metadata', () => {
    const meta = parseOne('indexed.ts')
    expect(meta.indexes).toEqual([{ columns: ['email'], unique: true }])
  })

  it('should return an empty array for a class without @PgEntity', () => {
    expect(parsePgEntities([entity('plain.ts')])).toEqual([])
  })

  it('should throw when more than one @PgKey is declared', () => {
    expect(() => parsePgEntities([entity('multi-key.ts')])).toThrow(/exactly one @PgKey/)
  })

  it('should throw when no @PgKey is declared', () => {
    expect(() => parsePgEntities([entity('no-key.ts')])).toThrow(/exactly one @PgKey/)
  })

  it('should resolve a locally-declared const referenced from a decorator', () => {
    expect(parseOne('const-ref.ts').schema).toBe('tenant')
  })

  it('should reject a non-boolean option value', () => {
    expect(() => parsePgEntities([entity('bad-bool.ts')])).toThrow(/expected a boolean/)
  })
})

describe('builder parser — parsePgEntities (filesystem Program)', () => {
  it('should resolve the User entity fixture into metadata', () => {
    const metas = parsePgEntities([entity('user.ts')])
    expect(metas).toHaveLength(1)
    const meta = metas[0]!
    expect(meta.table).toBe('users')
    expect(meta.schema).toBe('public')
    expect(meta.comment).toBe('Application users')
    expect(meta.key).toEqual({ propertyKey: 'id', column: 'id', generated: false, comment: '' })
    expect(meta.columns.map(c => c.propertyKey).sort()).toEqual(['createdAt', 'displayName', 'email'])
    expect(meta.indexes).toEqual([{ columns: ['email'], unique: true }])
  })

  it('should parse multiple entity files at once', () => {
    const metas = parsePgEntities([
      entity('user.ts'),
      entity('article.ts'),
      entity('product.ts'),
      entity('member.ts'),
      entity('snake-case.ts'),
    ])
    expect(metas.map(m => m.table).sort()).toEqual([
      'article',
      'members',
      'product',
      'snake_case',
      'users',
    ])
  })
})
