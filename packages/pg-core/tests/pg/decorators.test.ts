/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { PgEntity, PgKey, PgColumn, PgIndex } from '../../src/pg'

describe('Pg decorators — definitions', () => {
  it('should export the four entity decorators as functions', () => {
    expect(typeof PgEntity).toBe('function')
    expect(typeof PgKey).toBe('function')
    expect(typeof PgColumn).toBe('function')
    expect(typeof PgIndex).toBe('function')
  })

  it('should return an decorator factory when called (no runtime side effects)', () => {
    // @PgEntity / @PgIndex are class decorators; @PgKey / @PgColumn are field
    // decorators. Calling them returns the decorator function without throwing.
    expect(typeof PgEntity({})).toBe('function')
    expect(typeof PgIndex({ columns: ['a'] })).toBe('function')
    expect(typeof PgKey({})).toBe('function')
    expect(typeof PgColumn({ columnType: 'TEXT' })).toBe('function')
  })
})

describe('Pg decorators — PgKey field type validation (runtime guard)', () => {
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
