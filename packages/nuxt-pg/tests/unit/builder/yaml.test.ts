import { describe, it, expect } from 'vitest'
import { parsePgConfigYaml } from '../../../src/builder/yaml'
import { samplePgConfigYaml, samplePgConfig } from '../../fixtures/pg-config'

describe('parsePgConfigYaml', () => {
  it('parses a valid config into a PgConfigMetadata object', () => {
    const cfg = parsePgConfigYaml(samplePgConfigYaml)
    expect(cfg.pool.max).toBe(samplePgConfig.pool.max)
    expect(cfg.databases.default.master.url).toBe(samplePgConfig.databases.default.master.url)
    expect(cfg.databases.default.slaves).toEqual([])
  })

  it('parses read-replica (slave) nodes', () => {
    const yaml = `
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
    const cfg = parsePgConfigYaml(yaml)
    expect(cfg.databases.default.slaves).toHaveLength(1)
    expect(cfg.databases.default.slaves[0].username).toBe('r')
  })
})
