import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PgDataSource, PgDataSourceManager } from '../../src'
import type { PgConfigMetadata } from '../../src'

// Build the datasource config metadata in code so the tests exercise the same
// shape the app uses in development.
const CONFIG: PgConfigMetadata = {
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
}

const POOL = CONFIG.pool
const DEFAULT_DB = CONFIG.databases.default!

// ---------------------------------------------------------------------------
// Fake `pg` driver
//
// PgDataSource always creates pools through the real default pool factory, so
// the driver is mocked at the module level: `new Pool(options)` records the
// options it was built with plus every query, and never opens a connection.
// The url -> pool options parsing still runs, so the production wiring is
// exercised without a database.
// ---------------------------------------------------------------------------

const { FakePool, pools } = vi.hoisted(() => {
  class FakePool {
    readonly queries: Array<{ text: string; params?: unknown[] }> = []
    ended = false

    constructor(readonly options: Record<string, unknown>) {
      created.push(this)
    }

    query(text: string, params?: unknown[]): Promise<unknown> {
      this.queries.push({ text, params })
      return Promise.resolve({ rows: [] })
    }

    end(): Promise<void> {
      this.ended = true
      return Promise.resolve()
    }
  }

  // Pools are recorded in creation order: master first, then slaves.
  const created: FakePool[] = []

  return { FakePool, pools: created }
})

vi.mock('pg', () => ({ Pool: FakePool }))

beforeEach(() => {
  pools.length = 0
})

// ---------------------------------------------------------------------------
// PgDataSource — write/read routing
//
// We assert against the pool registry so we never reach through the
// PoolLike-typed public fields.
// ---------------------------------------------------------------------------

describe('PgDataSource', () => {
  it('should route writes (query) to the master only', async () => {
    const ds = new PgDataSource(DEFAULT_DB, POOL)

    await ds.query('INSERT INTO t VALUES (1)', [1])

    // pools[0] = master, pools[1] = slave0, pools[2] = slave1
    expect(pools[0]!.queries).toHaveLength(1)
    expect(pools[0]!.queries[0]!.text).toBe('INSERT INTO t VALUES (1)')
    expect(pools[1]!.queries).toHaveLength(0)
    expect(pools[2]!.queries).toHaveLength(0)
  })

  it('should round-robin reads across slaves and never touch master', async () => {
    const ds = new PgDataSource(DEFAULT_DB, POOL)

    await ds.queryRead('SELECT 1')
    await ds.queryRead('SELECT 2')
    await ds.queryRead('SELECT 3')

    // master untouched; 2 slaves -> first gets queries 1 & 3, second gets 2
    expect(pools[0]!.queries).toHaveLength(0)
    expect(pools[1]!.queries.map(q => q.text)).toEqual(['SELECT 1', 'SELECT 3'])
    expect(pools[2]!.queries.map(q => q.text)).toEqual(['SELECT 2'])
  })

  it('should fall back to master for reads when there are no slaves', async () => {
    const ds = new PgDataSource({ master: DEFAULT_DB.master, slaves: [] }, POOL)

    await ds.queryRead('SELECT 1')

    expect(pools[0]!.queries).toHaveLength(1)
    expect(pools[0]!.queries[0]!.text).toBe('SELECT 1')
  })

  it('should build the master pool from the node url and credentials', async () => {
    new PgDataSource(DEFAULT_DB, POOL)

    expect(pools[0]!.options).toMatchObject({
      host: 'localhost',
      port: 5432,
      database: 'opencowstudio_dev',
      user: 'postgres',
      password: 'postgres',
      max: 18,
      min: 18,
    })
  })

  it('should end master and all slave pools on end()', async () => {
    const ds = new PgDataSource(DEFAULT_DB, POOL)

    await ds.end()

    expect(pools.every(p => p.ended)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// PgDataSourceManager — multi-database lookup
// ---------------------------------------------------------------------------

describe('PgDataSourceManager', () => {
  it('should expose every configured dbName', () => {
    const mgr = new PgDataSourceManager(CONFIG)
    expect(mgr.dbNames.sort()).toEqual(['default'])
  })

  it('should return the default datasource when no dbName is given', () => {
    const mgr = new PgDataSourceManager(CONFIG)
    expect(mgr.get()).toBe(mgr.get('default'))
  })

  it('should return the matching datasource per dbName', () => {
    const mgr = new PgDataSourceManager(CONFIG)
    expect(mgr.get('default')).toBeDefined()
    expect(mgr.has('default')).toBe(true)
    expect(mgr.has('missing')).toBe(false)
  })

  it('should throw when requesting an unknown dbName', () => {
    const mgr = new PgDataSourceManager(CONFIG)
    expect(() => mgr.get('missing')).toThrow(/No PostgreSQL datasource/)
  })

  it('should end all datasources on endAll()', async () => {
    const mgr = new PgDataSourceManager(CONFIG)
    await mgr.endAll()
    expect(pools.every(p => p.ended)).toBe(true)
  })
})
