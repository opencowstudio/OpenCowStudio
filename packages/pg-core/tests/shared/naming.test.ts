import { describe, it, expect } from 'vitest'
import { camelToSnake, camelizeKeys, snakeToCamel } from '../../src/shared/naming'

// Guards the convention `shared/naming.ts` documents: the two directions are
// halves of one conversion, so they are tested together, including the
// round-trip invariant that ties them. Pure string / object functions, so
// nothing else is needed here.

describe('camelToSnake', () => {
  it('should split camelCase into snake_case', () => {
    expect(camelToSnake('camelCase')).toBe('camel_case')
    expect(camelToSnake('columnDefault')).toBe('column_default')
    expect(camelToSnake('SnakeCase')).toBe('snake_case')
  })

  it('should treat a digit as a word character', () => {
    expect(camelToSnake('address1Line')).toBe('address1_line')
  })

  it('should split a run of capitals before a lowercase letter', () => {
    expect(camelToSnake('HTTPServer')).toBe('http_server')
  })

  it('should collapse separators and lowercase the name', () => {
    expect(camelToSnake('with space')).toBe('with_space')
    expect(camelToSnake('with-dash')).toBe('with_dash')
  })

  it('should pass an already snake_case name through unchanged', () => {
    expect(camelToSnake('snake_case')).toBe('snake_case')
  })
})

describe('snakeToCamel', () => {
  it('should join snake_case into camelCase', () => {
    expect(snakeToCamel('snake_case')).toBe('snakeCase')
    expect(snakeToCamel('column_default')).toBe('columnDefault')
  })

  it('should only transform an underscore followed by a word character', () => {
    expect(snakeToCamel('UPPER_CASE')).toBe('UPPER_CASE')
    expect(snakeToCamel('a__b')).toBe('a_B')
  })

  it('should pass an already camelCase name through unchanged', () => {
    expect(snakeToCamel('udtName')).toBe('udtName')
  })
})

describe('naming round trip', () => {
  it('should be stable when a snake_case name goes to camelCase and back', () => {
    const names = ['a', 'snake_case', 'column_default', 'index_name', 'x1_y2']

    for (const name of names) {
      expect(camelToSnake(snakeToCamel(name)), name).toBe(name)
    }
  })
})

describe('camelizeKeys', () => {
  it('should convert every key to camelCase and keep the values untouched', () => {
    expect(camelizeKeys({ column_name: 'id', column_default: null })).toEqual({
      columnName: 'id',
      columnDefault: null,
    })
  })

  it('should pass an already camelCase key through unchanged', () => {
    expect(camelizeKeys({ udtName: 'int8' })).toEqual({ udtName: 'int8' })
  })

  it('should return an empty object for an empty row', () => {
    expect(camelizeKeys({})).toEqual({})
  })
})
