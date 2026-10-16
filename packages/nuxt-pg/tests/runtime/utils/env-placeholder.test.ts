import { describe, it, expect } from 'vitest'
import type { PgConfigMetadata } from '@opencowstudio/pg-core'
import { resolvePgConfigPlaceholders } from '../../../src/runtime/utils/env-placeholder'

function makeMetadata(password: string): PgConfigMetadata {
  return {
    pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
    databases: {
      default: {
        master: { url: 'postgresql://localhost:5432/db', username: 'u', password },
        slaves: [{ url: 'postgresql://replica/db', username: 'r', password }],
      },
    },
  }
}

describe('resolvePgConfigPlaceholders', () => {
  it('replaces a ${VAR:default} placeholder with the value from the environment', () => {
    const meta = resolvePgConfigPlaceholders(makeMetadata('${DB_PASSWORD:fallback}'), {
      DB_PASSWORD: 'resolved-secret',
    })

    expect(meta.databases.default.master.password).toBe('resolved-secret')
    expect(meta.databases.default.slaves[0]!.password).toBe('resolved-secret')
  })

  it('falls back to the default value when the variable is unset', () => {
    const meta = resolvePgConfigPlaceholders(makeMetadata('${DB_PASSWORD:fallback}'), {})

    expect(meta.databases.default.master.password).toBe('fallback')
  })

  it('resolves an inline placeholder inside a longer string', () => {
    const metadata = makeMetadata('p')
    metadata.databases.default.master.url = 'postgresql://${DB_HOST}:5432/db'

    const meta = resolvePgConfigPlaceholders(metadata, { DB_HOST: 'db.internal' })

    expect(meta.databases.default.master.url).toBe('postgresql://db.internal:5432/db')
  })

  it('throws when a required variable without a default is unset', () => {
    expect(() => resolvePgConfigPlaceholders(makeMetadata('${DB_PASSWORD}'), {})).toThrow(
      /DB_PASSWORD/,
    )
  })

  it('leaves strings without placeholders untouched', () => {
    const meta = resolvePgConfigPlaceholders(makeMetadata('plain-secret'), {})

    expect(meta.databases.default.master.password).toBe('plain-secret')
  })
})
