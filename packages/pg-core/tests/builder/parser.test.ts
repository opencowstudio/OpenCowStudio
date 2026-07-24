/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { parsePgEntities } from '../../src/builder'
import type { PgEntityRaw } from '../../src'

const entitiesDir = fileURLToPath(new URL('../fixtures/entities/', import.meta.url))
const entity = (name: string) => `${entitiesDir}${name}`

/** Parse a single entity fixture file and return its one PgEntityRaw. */
function parseOne(name: string): PgEntityRaw {
  const raws = parsePgEntities([entity(name)])
  if (raws.length !== 1) {
    throw new Error(`expected exactly one entity in ${name}, got ${raws.length}`)
  }
  return raws[0]!
}

describe('builder parser — parsePgEntities (verbatim raw, no defaults)', () => {
  it('should return the decorator options verbatim (no defaults, no conversion)', () => {
    const raw = parseOne('raw.ts')
    expect(raw.className).toBe('RawEntity')
    // string booleans are preserved exactly as supplied
    expect(raw.options.createTableAuto).toBe('false')
    expect(raw.options.dbName).toBe('my_db')
    expect(raw.options.schema).toBe('app')
    expect(raw.options.table).toBe('my_tbl')
    expect(raw.key).toMatchObject({ propertyKey: 'id', options: { generated: 'false' } })
    expect(raw.columns).toHaveLength(1)
    expect(raw.columns[0]).toMatchObject({
      propertyKey: 'name',
      options: { columnType: 'TEXT', comment: 'a comment' },
    })
  })

  it('should parse @PgIndex decorators into the indexes array (nested array/object)', () => {
    const raw = parseOne('indexed.ts')
    expect(raw.indexes).toHaveLength(1)
    expect(raw.indexes[0]).toMatchObject({
      options: { columns: ['email'], unique: true },
    })
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
    const raw = parseOne('const-ref.ts')
    expect(raw.options.schema).toBe('tenant')
  })
})

describe('builder parser — parsePgEntities (filesystem Program)', () => {
  it('should parse the User entity fixture into a PgEntityRaw', () => {
    const raws = parsePgEntities([entity('user.ts')])
    expect(raws).toHaveLength(1)
    const raw = raws[0]!
    expect(raw.className).toBe('User')
    expect(raw.options.table).toBe('users')
    expect(raw.options.schema).toBe('public')
    expect(raw.key).toMatchObject({ propertyKey: 'id', options: { generated: false } })
    const columnNames = raw.columns.map(c => String(c.propertyKey)).sort()
    expect(columnNames).toEqual(['createdAt', 'displayName', 'email'])
    // indexes are declared via @PgIndex, not @PgEntity
    expect(raw.indexes).toEqual([{ options: { columns: ['email'], unique: true } }])
  })

  it('should parse multiple entity files at once', () => {
    const raws = parsePgEntities([
      entity('user.ts'),
      entity('article.ts'),
      entity('product.ts'),
      entity('member.ts'),
      entity('snake-case.ts'),
    ])
    const classNames = raws.map(r => r.className).sort()
    expect(classNames).toEqual(['Article', 'Member', 'Product', 'SnakeCase', 'User'])
  })
})
