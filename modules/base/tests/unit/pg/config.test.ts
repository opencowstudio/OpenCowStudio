import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadPgConfigFromFile,
  loadPgConfigFromYaml,
  parsePgUrl,
  toConnectionOptions,
  type PgDataSourceConfig,
  type PgPoolConfig,
} from '../../../src/pg'

const POOL: PgPoolConfig = {
  max: 18,
  min: 18,
  idleTimeoutMillis: 600_000,
  maxLifetimeSeconds: 1800,
}

const VALID_YAML = `
pool:
  max: 18
  min: 18
  idleTimeoutMillis: 600000
  maxLifetimeSeconds: 1800
databases:
  root:
    master:
      url: postgresql://localhost:5432/root
      username: root
      password: secret
    slaves:
      - url: postgresql://localhost:5432/root
        username: root
        password: secret
`

// ---------------------------------------------------------------------------
// parsePgUrl
// ---------------------------------------------------------------------------

describe('parsePgUrl', () => {
  it('should parse host, port and database from a standard url', () => {
    expect(parsePgUrl('postgresql://localhost:5432/root')).toEqual({
      host: 'localhost',
      port: 5432,
      database: 'root',
    })
  })

  it('should default the port to 5432 when omitted', () => {
    expect(parsePgUrl('postgresql://localhost/root').port).toBe(5432)
  })

  it('should accept the postgres:// protocol alias', () => {
    expect(parsePgUrl('postgres://db.example.com:6543/app').host).toBe('db.example.com')
  })

  it('should throw on a non-postgres protocol', () => {
    expect(() => parsePgUrl('mysql://localhost/db')).toThrow(/protocol/)
  })

  it('should throw when the host is missing', () => {
    expect(() => parsePgUrl('postgresql:///root')).toThrow(/host/)
  })

  it('should throw when the port is not numeric', () => {
    expect(() => parsePgUrl('postgresql://localhost:abc/root')).toThrow(/port/)
  })
})

// ---------------------------------------------------------------------------
// toConnectionOptions
// ---------------------------------------------------------------------------

describe('toConnectionOptions', () => {
  it('should merge node credentials with pool settings', () => {
    const opts = toConnectionOptions(
      { url: 'postgresql://db.host:6543/mydb', username: 'u', password: 'p' },
      POOL,
    )
    expect(opts).toMatchObject({
      host: 'db.host',
      port: 6543,
      database: 'mydb',
      user: 'u',
      password: 'p',
      max: 18,
      min: 18,
      idleTimeoutMillis: 600_000,
      maxLifetimeSeconds: 1800,
    })
  })
})

// ---------------------------------------------------------------------------
// loadPgConfigFromYaml
// ---------------------------------------------------------------------------

describe('loadPgConfigFromYaml', () => {
  it('should load a fully valid multi-database config', () => {
    const config = loadPgConfigFromYaml(VALID_YAML)
    expect(config.pool).toEqual({
      max: 18,
      min: 18,
      idleTimeoutMillis: 600_000,
      maxLifetimeSeconds: 1800,
    })
    expect(Object.keys(config.databases)).toEqual(['root'])
    expect(config.databases.root!.master).toMatchObject({
      url: 'postgresql://localhost:5432/root',
      username: 'root',
      password: 'secret',
    })
    expect(config.databases.root!.slaves).toHaveLength(1)
  })

  it('should support multiple databases keyed by dbName', () => {
    const yaml = `
pool:
  max: 2
  min: 1
  idleTimeoutMillis: 1000
  maxLifetimeSeconds: 10
databases:
  primary:
    master:
      url: postgresql://localhost/primary
      username: u
      password: p
  analytics:
    master:
      url: postgresql://localhost/analytics
      username: u
      password: p
    slaves:
      - url: postgresql://localhost/analytics
        username: u
        password: p
`
    const config = loadPgConfigFromYaml(yaml)
    expect(Object.keys(config.databases).sort()).toEqual(['analytics', 'primary'])
    expect(config.databases.analytics!.slaves).toHaveLength(1)
  })

  it('should treat a missing slaves list as an empty array (single-node mode)', () => {
    const config = loadPgConfigFromYaml(VALID_YAML.replace(/slaves:[\s\S]*$/, ''))
    expect(config.databases.root!.slaves).toEqual([])
  })

  it('should accept the idleTtimeoutMillis typo for backwards compatibility', () => {
    const yaml = `
pool:
  max: 2
  min: 1
  idleTtimeoutMillis: 1000
  maxLifetimeSeconds: 10
databases:
  root:
    master:
      url: postgresql://localhost/root
      username: u
      password: p
`
    const config = loadPgConfigFromYaml(yaml)
    expect(config.pool.idleTimeoutMillis).toBe(1000)
  })

  it('should throw when the pool section is missing', () => {
    const yaml = `
databases:
  root:
    master:
      url: postgresql://localhost/root
      username: u
      password: p
`
    expect(() => loadPgConfigFromYaml(yaml)).toThrow(/pool/)
  })

  it('should throw when the databases section is missing', () => {
    const yaml = `
pool:
  max: 2
  min: 1
  idleTimeoutMillis: 1000
  maxLifetimeSeconds: 10
`
    expect(() => loadPgConfigFromYaml(yaml)).toThrow(/databases/)
  })

  it('should throw when a database has no master', () => {
    const yaml = `
pool:
  max: 2
  min: 1
  idleTimeoutMillis: 1000
  maxLifetimeSeconds: 10
databases:
  root:
    slaves:
      - url: postgresql://localhost/root
        username: u
        password: p
`
    expect(() => loadPgConfigFromYaml(yaml)).toThrow(/master/)
  })

  it('should throw when a node is missing the url', () => {
    const yaml = `
pool:
  max: 2
  min: 1
  idleTimeoutMillis: 1000
  maxLifetimeSeconds: 10
databases:
  root:
    master:
      username: u
      password: p
`
    expect(() => loadPgConfigFromYaml(yaml)).toThrow(/url/)
  })

  it('should throw when the top-level document is empty', () => {
    expect(() => loadPgConfigFromYaml('')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// loadPgConfigFromFile
// ---------------------------------------------------------------------------

describe('loadPgConfigFromFile', () => {
  it('should read and parse a config file from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pg-config-'))
    const file = join(dir, 'pg.config.yaml')
    writeFileSync(file, VALID_YAML, 'utf8')

    const config = loadPgConfigFromFile(file)
    expect(config).toBeDefined()
    expect(Object.keys(config.databases)).toContain('root')
  })

  it('should throw when the file does not exist', () => {
    expect(() => loadPgConfigFromFile('/no/such/pg.config.yaml')).toThrow()
  })
})

// Re-exported for the datasource test import parity check.
export type { PgDataSourceConfig }
