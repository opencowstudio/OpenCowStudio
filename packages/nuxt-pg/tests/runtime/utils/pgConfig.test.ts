import { describe, it, expect } from 'vitest'
import { parsePgConfig, PgConfigParseError } from '../../../src/runtime/utils/pgConfig'

describe('parsePgConfig', () => {
  it('builds metadata from a fully numeric config', () => {
    const raw = {
      pool: { max: 18, min: 18, idleTimeoutMillis: 600000, maxLifetimeSeconds: 1800 },
      databases: {
        default: {
          master: { url: 'postgresql://localhost:5432/db', username: 'u', password: 'p' },
          slaves: [],
        },
      },
    }

    const meta = parsePgConfig(raw)

    expect(meta.pool).toEqual({
      max: 18,
      min: 18,
      idleTimeoutMillis: 600000,
      maxLifetimeSeconds: 1800,
    })
    expect(meta.databases.default.master).toEqual({
      url: 'postgresql://localhost:5432/db',
      username: 'u',
      password: 'p',
    })
  })

  it('coerces numeric strings in the pool to numbers', () => {
    const raw = {
      pool: { max: '18', min: '18', idleTimeoutMillis: '600000', maxLifetimeSeconds: '1800' },
      databases: {
        default: {
          master: { url: 'postgresql://localhost:5432/db', username: 'u', password: 'p' },
          slaves: [],
        },
      },
    }

    const meta = parsePgConfig(raw)

    expect(meta.pool).toEqual({
      max: 18,
      min: 18,
      idleTimeoutMillis: 600000,
      maxLifetimeSeconds: 1800,
    })
  })

  it('coerces an unquoted numeric password/url to a string', () => {
    const raw = {
      pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
      databases: {
        default: {
          master: { url: 'postgresql://localhost:5432/db', username: 'u', password: 1234 },
          slaves: [],
        },
      },
    }

    const meta = parsePgConfig(raw)

    expect(meta.databases.default.master.password).toBe('1234')
  })

  it('throws a detailed error when a pool field is a non-numeric string', () => {
    const raw = {
      pool: { max: 'abc', min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
      databases: {},
    }

    expect(() => parsePgConfig(raw)).toThrow(PgConfigParseError)
    try {
      parsePgConfig(raw)
    } catch (err) {
      const e = err as PgConfigParseError
      expect(e.path).toBe('pg.pool.max')
      expect(e.expected).toBe('number')
      expect(e.message).toContain('pg.pool.max')
      expect(e.message).toContain('abc')
    }
  })

  it('throws a detailed error when databases is missing', () => {
    const raw = {
      pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
    }

    expect(() => parsePgConfig(raw)).toThrow(PgConfigParseError)
    try {
      parsePgConfig(raw)
    } catch (err) {
      const e = err as PgConfigParseError
      expect(e.path).toBe('pg.databases')
      expect(e.expected).toBe('object')
    }
  })

  it('treats missing/undefined slaves as an empty array', () => {
    const raw = {
      pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
      databases: {
        default: {
          master: { url: 'postgresql://localhost:5432/db', username: 'u', password: 'p' },
        },
      },
    }

    const meta = parsePgConfig(raw)
    expect(meta.databases.default.slaves).toEqual([])
  })

  it('parses an array of slave nodes with string values', () => {
    const raw = {
      pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
      databases: {
        default: {
          master: { url: 'postgresql://localhost:5432/db', username: 'u', password: 'p' },
          slaves: [
            { url: 'postgresql://localhost:5432/db', username: 'u', password: 'p' },
            { url: 'postgresql://localhost:5432/db', username: 'u', password: 'p' },
          ],
        },
      },
    }

    const meta = parsePgConfig(raw)
    expect(meta.databases.default.slaves).toHaveLength(2)
  })

  it('throws a detailed error when slaves is not an array', () => {
    const raw = {
      pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
      databases: {
        default: {
          master: { url: 'postgresql://localhost:5432/db', username: 'u', password: 'p' },
          slaves: { url: 'x' },
        },
      },
    }

    expect(() => parsePgConfig(raw)).toThrow(PgConfigParseError)
    try {
      parsePgConfig(raw)
    } catch (err) {
      const e = err as PgConfigParseError
      expect(e.path).toBe('pg.databases.default.slaves')
      expect(e.expected).toBe('array')
    }
  })
})
