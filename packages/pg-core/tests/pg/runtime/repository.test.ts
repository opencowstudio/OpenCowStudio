/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { resolvePgEntityRaw, type PgEntityRaw } from '../../../src/pg'
import { parsePgEntities } from '../../../src/pg/builder'

const entitiesDir = fileURLToPath(new URL('../../fixtures/entities/', import.meta.url))
const entity = (name: string) => `${entitiesDir}${name}`

/** Parse a single entity fixture file and return its one PgEntityRaw. */
function parseOne(name: string): PgEntityRaw {
  const raws = parsePgEntities([entity(name)])
  if (raws.length !== 1) {
    throw new Error(`expected exactly one entity in ${name}, got ${raws.length}`)
  }
  return raws[0]!
}

describe('runtime repository — resolvePgEntityRaw (normalisation)', () => {
  it('should normalise BooleanLike strings to real booleans', () => {
    const meta = resolvePgEntityRaw(parseOne('bool-entity.ts'))
    expect(meta.createTableAuto).toBe(false)
    expect(meta.addColumnAuto).toBe(false)
    expect(meta.createIndexAuto).toBe(true)
    expect(meta.key.generated).toBe(false)
  })

  it('should apply defaults for omitted boolean options', () => {
    const meta = resolvePgEntityRaw(parseOne('default-bool.ts'))
    expect(meta.createTableAuto).toBe(true)
    expect(meta.addColumnAuto).toBe(true)
    expect(meta.createIndexAuto).toBe(true)
    expect(meta.key.generated).toBe(true)
  })

  it('should derive the default table name from a camelCase class name', () => {
    const meta = resolvePgEntityRaw(parseOne('snake-case.ts'))
    expect(meta.table).toBe('snake_case')
  })

  it('should resolve @PgIndex raw options into validated metadata', () => {
    const meta = resolvePgEntityRaw(parseOne('user.ts'))
    expect(meta.indexes).toEqual([{ columns: ['email'], unique: true }])
  })

  it('should throw on an unparseable BooleanLike string', () => {
    expect(() => resolvePgEntityRaw(parseOne('bad-bool.ts'))).toThrow(/Invalid boolean value/)
  })
})
