import { describe, it, expect } from 'vitest'
import { toTsLiteral } from '../../src/builder/codegen'

describe('toTsLiteral', () => {
  it('emits a nested object literal with bare keys and single quotes', () => {
    const value = {
      pool: { max: 18, min: 18 },
      databases: {
        default: {
          master: { url: 'postgresql://localhost:5432/db', username: 'root' },
          slaves: [],
        },
      },
    }

    expect(toTsLiteral(value)).toBe(
      [
        '{',
        '  pool: {',
        '    max: 18,',
        '    min: 18,',
        '  },',
        '  databases: {',
        '    default: {',
        '      master: {',
        "        url: 'postgresql://localhost:5432/db',",
        "        username: 'root',",
        '      },',
        '      slaves: [],',
        '    },',
        '  },',
        '}',
      ].join('\n'),
    )
  })

  it('emits an array of objects at the root', () => {
    expect(toTsLiteral([{ table: 'user', enabled: true }])).toBe(
      [
        '[',
        '  {',
        "    table: 'user',",
        '    enabled: true,',
        '  },',
        ']',
      ].join('\n'),
    )
  })

  it('quotes keys that are not valid identifiers', () => {
    expect(toTsLiteral({ 'user-account': 1, db: 2 })).toBe(
      ['{', "  'user-account': 1,", '  db: 2,', '}'].join('\n'),
    )
    expect(toTsLiteral({ 1: 'a' })).toBe(['{', "  '1': 'a',", '}'].join('\n'))
  })

  it('escapes quotes and backslashes in string values', () => {
    expect(toTsLiteral({ password: "p'a\\ss" })).toBe(`{\n  password: 'p\\'a\\\\ss',\n}`)
  })

  it('emits primitives, empty containers and undefined as-is', () => {
    expect(toTsLiteral(null)).toBe('null')
    expect(toTsLiteral(undefined)).toBe('undefined')
    expect(toTsLiteral(0)).toBe('0')
    expect(toTsLiteral(false)).toBe('false')
    expect(toTsLiteral({})).toBe('{}')
    expect(toTsLiteral([])).toBe('[]')
    // Unlike JSON.stringify, an explicit undefined is preserved.
    expect(toTsLiteral({ default: undefined })).toBe('{\n  default: undefined,\n}')
  })
})
