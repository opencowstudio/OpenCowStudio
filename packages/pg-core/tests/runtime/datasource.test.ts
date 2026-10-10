import { describe, it, expect, afterEach, vi } from 'vitest'
import { PgDataSource, PgDataSourceManager } from '../../src'
import type {
  PgConfigMetadata,
  PgDatabaseMetadata,
  PgNodeMetadata,
  PgPoolMetadata,
} from '../../src'

// No mocked driver: these tests build real `pg` pools. node-postgres connects
// lazily, so constructing a datasource opens no socket — the offline suite
// below never touches a database. Routing assertions need real connections, so
// they live in the live suite, which is skipped unless PG_TEST_URL is set.

// Build the datasource config metadata in code so the tests exercise the same
// shape the app uses in development.
const POOL: PgPoolMetadata = {
  max: 18,
  min: 18,
  idleTimeoutMillis: 600000,
  maxLifetimeSeconds: 1800,
}

// Credentials of the local development instance created by
// docker/postgres/docker-compose.yml.
const TEST_USERNAME = process.env.PG_TEST_USER ?? 'root'
const TEST_PASSWORD = process.env.PG_TEST_PASSWORD ?? 'FYm7JqaEcptxUTgys'

function node(): PgNodeMetadata {
  return {
    url: 'postgresql://localhost:5432/opencowstudio_dev',
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
  }
}

const DEFAULT_DB: PgDatabaseMetadata = {
  master: node(),
  slaves: [node(), node()],
}

const CONFIG: PgConfigMetadata = {
  pool: POOL,
  databases: { default: DEFAULT_DB },
}

// Every datasource the live suite creates must be closed, otherwise the
// connection pools keep the process alive.
const closers: Array<() => Promise<void>> = []

function deferClose(close: () => Promise<void>): void {
  closers.push(close)
}

afterEach(async () => {
  await Promise.all(closers.splice(0).map(close => close()))
})

// ---------------------------------------------------------------------------
// Offline suite — real pools, no connections
// ---------------------------------------------------------------------------

describe('PgDataSource', () => {
  it('should build one pool per configured node', () => {
    const ds = new PgDataSource(DEFAULT_DB, POOL)
    deferClose(() => ds.end())

    expect(ds.master).toBeDefined()
    expect(ds.slaves).toHaveLength(2)
    expect(ds.master).not.toBe(ds.slaves[0])
    expect(ds.slaves[0]).not.toBe(ds.slaves[1])
  })

  it('should throw when the node url cannot be parsed', () => {
    expect(
      () => new PgDataSource({ master: { ...node(), url: 'not-a-url' }, slaves: [] }, POOL),
    ).toThrow()
  })

  it('should end master and all slave pools on end()', async () => {
    const ds = new PgDataSource(DEFAULT_DB, POOL)

    await ds.end()
  })

  it('should not run the initialization SQL on construction', () => {
    // Construction is now side-effect free: the DDL is only triggered through
    // the manager's `initializeSql`.
    const spy = vi.spyOn(PgDataSource.prototype, 'initializeSql').mockResolvedValue()
    try {
      const ds = new PgDataSource(DEFAULT_DB, POOL)
      deferClose(() => ds.end())

      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('PgDataSourceManager', () => {
  it('should expose every configured dbName', () => {
    const mgr = new PgDataSourceManager(CONFIG)
    deferClose(() => mgr.endAll())
    expect(mgr.dbNames.sort()).toEqual(['default'])
  })

  it('should return the default datasource when no dbName is given', () => {
    const mgr = new PgDataSourceManager(CONFIG)
    deferClose(() => mgr.endAll())
    expect(mgr.get()).toBe(mgr.get('default'))
  })

  it('should return the matching datasource per dbName', () => {
    const mgr = new PgDataSourceManager(CONFIG)
    deferClose(() => mgr.endAll())
    expect(mgr.get('default')).toBeDefined()
    expect(mgr.has('default')).toBe(true)
    expect(mgr.has('missing')).toBe(false)
  })

  it('should throw when requesting an unknown dbName', () => {
    const mgr = new PgDataSourceManager(CONFIG)
    deferClose(() => mgr.endAll())
    expect(() => mgr.get('missing')).toThrow(/No PostgreSQL datasource/)
  })

  it('should end all datasources on endAll()', async () => {
    const mgr = new PgDataSourceManager(CONFIG)

    await mgr.endAll()
  })

  it('should run the initialization SQL on every datasource', async () => {
    const spy = vi.spyOn(PgDataSource.prototype, 'initializeSql').mockResolvedValue()
    try {
      const mgr = new PgDataSourceManager(CONFIG)
      deferClose(() => mgr.endAll())

      await mgr.initializeSql()

      expect(spy).toHaveBeenCalledWith('default')
    } finally {
      spy.mockRestore()
    }
  })
})

// ---------------------------------------------------------------------------
// Live suite — requires a real PostgreSQL instance
//
// Run it with:
//   PG_TEST_URL=postgresql://localhost:5432/opencowstudio_dev pnpm test
// Credentials default to the ones in docker/postgres/docker-compose.yml;
// override with PG_TEST_USER and PG_TEST_PASSWORD. Routing is observed through
// pg_backend_pid(): pools are
// separate physical connections, so a different pid means a different node
// served the query.
// ---------------------------------------------------------------------------

const TEST_URL = process.env.PG_TEST_URL

// Small pool: the live suite only needs one connection per node.
const LIVE_POOL: PgPoolMetadata = {
  max: 2,
  min: 0,
  idleTimeoutMillis: 1000,
  maxLifetimeSeconds: 10,
}

const LIVE_TIMEOUT = 20000

function liveNode(): PgNodeMetadata {
  return {
    url: TEST_URL ?? '',
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
  }
}

function liveDs(database: PgDatabaseMetadata): PgDataSource {
  const ds = new PgDataSource(database, LIVE_POOL)
  deferClose(() => ds.end())
  return ds
}

/** Run a query and return the backend pid of the connection that served it. */
async function backendPid(ds: PgDataSource, read: boolean): Promise<number> {
  const sql = 'SELECT pg_backend_pid() AS pid'
  const result = (await (read ? ds.queryRead(sql, []) : ds.query(sql, []))) as {
    rows: Array<{ pid: number }>
  }
  return Number(result.rows[0]!.pid)
}

describe.skipIf(!TEST_URL)('PgDataSource (live database)', () => {
  it(
    'should route writes to the master and reads to a different connection',
    async () => {
      const ds = liveDs({ master: liveNode(), slaves: [liveNode(), liveNode()] })

      const writePid = await backendPid(ds, false)
      const secondWritePid = await backendPid(ds, false)
      const readPid = await backendPid(ds, true)

      // master connections are reused for consecutive writes
      expect(secondWritePid).toBe(writePid)
      // reads never reuse the master connection
      expect(readPid).not.toBe(writePid)
    },
    LIVE_TIMEOUT,
  )

  it(
    'should round-robin reads across slaves',
    async () => {
      const ds = liveDs({ master: liveNode(), slaves: [liveNode(), liveNode()] })

      const first = await backendPid(ds, true)
      const second = await backendPid(ds, true)
      const third = await backendPid(ds, true)

      expect(second).not.toBe(first)
      expect(third).toBe(first)
    },
    LIVE_TIMEOUT,
  )

  it(
    'should fall back to master for reads when there are no slaves',
    async () => {
      const ds = liveDs({ master: liveNode(), slaves: [] })

      const writePid = await backendPid(ds, false)
      const readPid = await backendPid(ds, true)

      expect(readPid).toBe(writePid)
    },
    LIVE_TIMEOUT,
  )

  it(
    'should reject the query when the credentials are wrong',
    async () => {
      const bad: PgNodeMetadata = { ...liveNode(), password: 'definitely-not-the-password' }
      const ds = liveDs({ master: bad, slaves: [] })

      await expect(ds.query('SELECT 1', [])).rejects.toThrow()
    },
    LIVE_TIMEOUT,
  )
})
