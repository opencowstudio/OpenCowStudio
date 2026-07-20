import { describe, it, expect } from 'vitest'
import { readPgConfigNamespace } from '../../src/builder/yaml'
import { samplePgConfigYaml } from '../fixtures/pg-config'

describe('readPgConfigNamespace', () => {
  it('extracts the pg namespace as a generic JSON object', () => {
    const ns = readPgConfigNamespace(samplePgConfigYaml)
    expect(ns).not.toBeNull()
    expect((ns!.pool as { max: number }).max).toBe(18)
    const databases = ns!.databases as Record<string, unknown>
    expect(databases.default).toBeDefined()
  })

  it('returns null when there is no pg namespace', () => {
    expect(readPgConfigNamespace('foo: bar')).toBeNull()
  })

  it('parses read-replica (slave) nodes', () => {
    const yaml = `
pg:
  pool:
    max: 1
    min: 1
    idleTimeoutMillis: 1
    maxLifetimeSeconds: 1
  databases:
    default:
      master:
        url: postgresql://localhost:5432/db
        username: u
        password: p
      slaves:
        - url: postgresql://localhost:5432/replica
          username: r
          password: r
`
    const ns = readPgConfigNamespace(yaml)
    const databases = ns!.databases as Record<string, { slaves: unknown[] }>
    expect(databases.default.slaves).toHaveLength(1)
    const slaves = databases.default.slaves[0] as { username: string }
    expect(slaves.username).toBe('r')
  })
})
