import { describe, it, expect } from 'vitest'
import {
  PgDataSource,
  PgDataSourceManager,
  type PoolFactory,
  type PoolLike,
} from '../../../src/pg'
import type {
  PgConfigMetadata,
  PgNodeMetadata,
} from '../../../src/pg'

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
// Fake pool — records queries and end() calls, no real database
// ---------------------------------------------------------------------------

class FakePool implements PoolLike {
  readonly queries: Array<{ text: string; params?: unknown[] }> = []
  ended = false

  constructor(readonly id: string) {}

  query(text: string, params?: unknown[]): Promise<unknown> {
    this.queries.push({ text, params })
    return Promise.resolve({ rows: [], id: this.id })
  }

  end(): Promise<void> {
    this.ended = true
    return Promise.resolve()
  }
}

function makeFactory(): { factory: PoolFactory; pools: FakePool[] } {
  const pools: FakePool[] = []
  const factory: PoolFactory = (node: PgNodeMetadata) => {
    const pool = new FakePool(node.url)
    pools.push(pool)
    return pool
  }
  return { factory, pools }
}

// ---------------------------------------------------------------------------
// PgDataSource — write/read routing
//
// The factory records every created pool in creation order: master first,
// then slaves. We assert against that registry so we never reach through the
// PoolLike-typed public fields.
// ---------------------------------------------------------------------------

describe('PgDataSource', () => {
  it('should route writes (query) to the master only', async () => {
    const { factory, pools } = makeFactory()
    const ds = new PgDataSource(DEFAULT_DB, POOL, factory)

    await ds.query('INSERT INTO t VALUES (1)', [1])

    // pools[0] = master, pools[1] = slave0, pools[2] = slave1
    expect(pools[0]!.queries).toHaveLength(1)
    expect(pools[0]!.queries[0]!.text).toBe('INSERT INTO t VALUES (1)')
    expect(pools[1]!.queries).toHaveLength(0)
    expect(pools[2]!.queries).toHaveLength(0)
  })

  it('should round-robin reads across slaves and never touch master', async () => {
    const { factory, pools } = makeFactory()
    const ds = new PgDataSource(DEFAULT_DB, POOL, factory)

    await ds.queryRead('SELECT 1')
    await ds.queryRead('SELECT 2')
    await ds.queryRead('SELECT 3')

    // master untouched; 2 slaves -> first gets queries 1 & 3, second gets 2
    expect(pools[0]!.queries).toHaveLength(0)
    expect(pools[1]!.queries.map(q => q.text)).toEqual(['SELECT 1', 'SELECT 3'])
    expect(pools[2]!.queries.map(q => q.text)).toEqual(['SELECT 2'])
  })

  it('should fall back to master for reads when there are no slaves', async () => {
    const { factory, pools } = makeFactory()
    const ds = new PgDataSource({ master: DEFAULT_DB.master, slaves: [] }, POOL, factory)

    await ds.queryRead('SELECT 1')

    expect(pools[0]!.queries).toHaveLength(1)
    expect(pools[0]!.queries[0]!.text).toBe('SELECT 1')
  })

  it('should end master and all slave pools on end()', async () => {
    const { factory, pools } = makeFactory()
    const ds = new PgDataSource(DEFAULT_DB, POOL, factory)

    await ds.end()

    expect(pools.every(p => p.ended)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// PgDataSourceManager — multi-database lookup
// ---------------------------------------------------------------------------

describe('PgDataSourceManager', () => {
  it('should expose every configured dbName', () => {
    const { factory } = makeFactory()
    const mgr = new PgDataSourceManager(CONFIG, factory)
    expect(mgr.dbNames.sort()).toEqual(['default'])
  })

  it('should return the default datasource when no dbName is given', () => {
    const { factory } = makeFactory()
    const mgr = new PgDataSourceManager(CONFIG, factory)
    expect(mgr.get()).toBe(mgr.get('default'))
  })

  it('should return the matching datasource per dbName', () => {
    const { factory } = makeFactory()
    const mgr = new PgDataSourceManager(CONFIG, factory)
    expect(mgr.get('default')).toBeDefined()
    expect(mgr.has('default')).toBe(true)
    expect(mgr.has('missing')).toBe(false)
  })

  it('should throw when requesting an unknown dbName', () => {
    const { factory } = makeFactory()
    const mgr = new PgDataSourceManager(CONFIG, factory)
    expect(() => mgr.get('missing')).toThrow(/No PostgreSQL datasource/)
  })

  it('should end all datasources on endAll()', async () => {
    const { factory, pools } = makeFactory()
    const mgr = new PgDataSourceManager(CONFIG, factory)
    // touch the datasource so its pools are created
    mgr.get('default')
    await mgr.endAll()
    expect(pools.every(p => p.ended)).toBe(true)
  })
})
