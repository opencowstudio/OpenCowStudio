/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import {
  PgEntity,
  PgKey,
  PgColumn,
  buildPgEntityRaw,
  resolvePgEntityRaw,
  type PgEntityRaw,
} from '../../src/pg'

describe('Pg decorators — PgKey field type validation', () => {
  it('should throw when a PgKey field is initialised with a non-string value (number)', () => {
    expect(() => {
      class BadKeyNumber {
        @PgKey()
        id = 42
      }

      new BadKeyNumber()
    }).toThrow(/Invalid PgKey/)
  })

  it('should throw when a PgKey field is initialised with a non-string value (object)', () => {
    expect(() => {
      class BadKeyObject {
        @PgKey()
        id = { a: 1 }
      }

      new BadKeyObject()
    }).toThrow(/Invalid PgKey/)
  })

  it('should allow a PgKey field that is declared but not yet assigned (undefined)', () => {
    expect(() => {
      class KeyUndefined {
        @PgKey()
        id!: string
      }

      new KeyUndefined()
    }).not.toThrow()
  })

  it('should accept a PgKey field holding a string value without throwing', () => {
    expect(() => {
      class GoodKeyType {
        @PgKey()
        id = 'abc'
      }

      new GoodKeyType()
    }).not.toThrow()
  })
})

describe('Pg decorators — raw config & two-stage resolution', () => {
  // A helper that constructs the entity (firing field decorators) and then
  // reads the unmodified raw config via buildPgEntityRaw.
  function rawFor(ctor: Function): PgEntityRaw {
    new (ctor as new () => unknown)()
    const raw = buildPgEntityRaw(ctor)
    if (!raw) throw new Error(`No raw config for ${ctor.name}`)
    return raw
  }

  it('buildPgEntityRaw should return the decorator options verbatim (no defaults, no conversion)', () => {
    @PgEntity({ dbName: 'my_db', schema: 'app', table: 'my_tbl', createTableAuto: 'false' as never })
    class RawEntity {
      @PgKey({ generated: 'false' as never })
      id!: string

      @PgColumn({ columnType: 'TEXT', comment: 'a comment' })
      name!: string
    }

    const raw = rawFor(RawEntity)
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

  it('resolvePgEntityRaw should normalise BooleanLike strings to real booleans', () => {
    @PgEntity({ createTableAuto: 'false' as never, addColumnAuto: '0' as never, createIndexAuto: 'true' as never })
    class BoolEntity {
      @PgKey({ generated: 'false' as never })
      id!: string

      @PgColumn({ columnType: 'TEXT' })
      name!: string
    }

    const raw = rawFor(BoolEntity)
    const meta = resolvePgEntityRaw(raw)
    expect(meta.createTableAuto).toBe(false)
    expect(meta.addColumnAuto).toBe(false)
    expect(meta.createIndexAuto).toBe(true)
    expect(meta.key.generated).toBe(false)
  })

  it('resolvePgEntityRaw should apply defaults for omitted boolean options', () => {
    @PgEntity()
    class DefaultBool {
      @PgKey()
      id!: string

      @PgColumn({ columnType: 'TEXT' })
      name!: string
    }

    const raw = rawFor(DefaultBool)
    const meta = resolvePgEntityRaw(raw)
    expect(meta.createTableAuto).toBe(true)
    expect(meta.addColumnAuto).toBe(true)
    expect(meta.createIndexAuto).toBe(true)
    expect(meta.key.generated).toBe(true)
  })

  it('resolvePgEntityRaw should normalise index.unique BooleanLike strings', () => {
    @PgEntity({ indexes: [{ columns: ['email'], unique: 'true' as never }] })
    class Indexed {
      @PgKey()
      id!: string
    }

    const raw = rawFor(Indexed)
    const meta = resolvePgEntityRaw(raw)
    expect(meta.indexes).toEqual([{ columns: ['email'], unique: true }])
  })

  it('resolvePgEntityRaw should throw on an unparseable BooleanLike string', () => {
    @PgEntity({ createTableAuto: 'maybe' as never })
    class BadBool {
      @PgKey()
      id!: string
    }

    const raw = rawFor(BadBool)
    expect(() => resolvePgEntityRaw(raw)).toThrow(/Invalid boolean value/)
  })

  it('buildPgEntityRaw should return undefined for a non-entity class', () => {
    class Plain {}
    expect(buildPgEntityRaw(Plain)).toBeUndefined()
  })

  it('should throw when more than one @PgKey is declared', () => {
    @PgEntity()
    class MultiKey {
      @PgKey()
      id!: string

      @PgKey()
      secondId!: string
    }

    expect(() => rawFor(MultiKey)).toThrow(/exactly one @PgKey/)
  })

  it('should throw when no @PgKey is declared', () => {
    @PgEntity()
    class NoKey {
      @PgColumn({ columnType: 'TEXT' })
      name!: string
    }

    expect(() => rawFor(NoKey)).toThrow(/exactly one @PgKey/)
  })
})
