import { describe, it, expect } from 'vitest'
import { definePgConfig } from '../../../src/pg'

// Mirrors packages/pg-core/pg.config.example.yaml so the documented shape is
// kept valid and in sync with the metadata definition.
const EXAMPLE_METADATA = definePgConfig({
  pool: {
    max: 18,
    min: 18,
    idleTimeoutMillis: 600000,
    maxLifetimeSeconds: 1800,
  },
  databases: {
    default: {
      master: {
        url: 'postgresql://localhost:5432/opencowstudio_dev',
        username: 'postgres',
        password: 'postgres',
      },
      slaves: [
        {
          url: 'postgresql://localhost:5432/opencowstudio_dev',
          username: 'postgres',
          password: 'postgres',
        },
        {
          url: 'postgresql://localhost:5432/opencowstudio_dev',
          username: 'postgres',
          password: 'postgres',
        },
      ],
    },
  },
})

describe('definePgConfig', () => {
  it('should accept the example metadata shape', () => {
    expect(EXAMPLE_METADATA.pool).toMatchObject({ max: 18, min: 18 })
    expect(Object.keys(EXAMPLE_METADATA.databases).sort()).toEqual(['default'])
    expect(EXAMPLE_METADATA.databases.default!.master).toMatchObject({
      url: 'postgresql://localhost:5432/opencowstudio_dev',
      username: 'postgres',
      password: 'postgres',
    })
    expect(EXAMPLE_METADATA.databases.default!.slaves).toHaveLength(2)
  })

  it('should require pool numbers', () => {
    expect(() => definePgConfig({
      pool: { max: 'x' as unknown as number, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
      databases: {
        default: { master: { url: 'postgresql://localhost:5432/db', username: 'u', password: 'p' }, slaves: [] },
      },
    })).toThrow(/pool\.max/)
  })

  it('should require a master node per database', () => {
    expect(() => definePgConfig({
      pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
      databases: {
        default: { slaves: [] } as unknown as never,
      },
    })).toThrow(/master/)
  })

  it('should require at least one database', () => {
    expect(() => definePgConfig({
      pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
      databases: {},
    })).toThrow(/at least one database/)
  })

  it('should fail fast on a malformed node URL', () => {
    expect(() => definePgConfig({
      pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
      databases: {
        default: { master: { url: 'not-a-url', username: 'u', password: 'p' }, slaves: [] },
      },
    })).toThrow(/Invalid PostgreSQL URL/)
  })
})
