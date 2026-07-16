import { Pool } from 'pg'
import {
  type PgConfigMetadata,
  type PgDatabaseMetadata,
  type PgNodeMetadata,
  type PgPoolMetadata,
} from './types.ts'

// ---------------------------------------------------------------------------
// Pool abstraction
//
// The datasource depends on a minimal `PoolLike` interface rather than the
// concrete node-postgres `Pool`. This keeps the routing logic pure and
// unit-testable with a fake pool, while the default factory wires up the real
// `pg` driver.
// ---------------------------------------------------------------------------

/** Minimal pool contract the datasource needs (compatible with pg.Pool). */
export interface PoolLike {
  query(text: string, params?: unknown[]): Promise<unknown>
  end(): Promise<void>
}

/** Builds a pool from a node's metadata plus the shared pool metadata. Injectable for testing. */
export type PoolFactory = (node: PgNodeMetadata, pool: PgPoolMetadata) => PoolLike

const DEFAULT_PG_PORT = 5432

/** Default factory: a real node-postgres connection pool, built directly from the metadata. */
function defaultPoolFactory(node: PgNodeMetadata, pool: PgPoolMetadata): PoolLike {
  const url = new URL(node.url)
  const port = url.port ? Number(url.port) : DEFAULT_PG_PORT
  const database = url.pathname.replace(/^\/+/, '')
  return new Pool({
    host: url.hostname,
    port,
    database,
    user: node.username,
    password: node.password,
    max: pool.max,
    min: pool.min,
    idleTimeoutMillis: pool.idleTimeoutMillis,
    maxLifetimeSeconds: pool.maxLifetimeSeconds,
  })
}

// ---------------------------------------------------------------------------
// PgDataSource — one database (master + read replicas)
// ---------------------------------------------------------------------------

export class PgDataSource {
  readonly master: PoolLike
  readonly slaves: PoolLike[]
  private slaveCursor = 0

  constructor(
    database: PgDatabaseMetadata,
    pool: PgPoolMetadata,
    factory: PoolFactory = defaultPoolFactory,
  ) {
    this.master = factory(database.master, pool)
    this.slaves = database.slaves.map(s => factory(s, pool))
  }

  /** Write path: always routed to the master. */
  query(text: string, params?: unknown[]): Promise<unknown> {
    return this.master.query(text, params)
  }

  /** Read path: round-robin across slaves; falls back to master if none. */
  queryRead(text: string, params?: unknown[]): Promise<unknown> {
    if (this.slaves.length === 0) {
      return this.master.query(text, params)
    }
    const slave = this.slaves[this.slaveCursor % this.slaves.length]!
    this.slaveCursor++
    return slave.query(text, params)
  }

  /** Close master and every slave pool. */
  async end(): Promise<void> {
    await Promise.all([
      this.master.end(),
      ...this.slaves.map(s => s.end()),
    ])
  }
}

// ---------------------------------------------------------------------------
// PgDataSourceManager — initialize from metadata & look up by dbName
//
// Constructed directly from `PgConfigMetadata`; the `dbName` of an entity (see
// @PgEntity) resolves to one of the registered datasources via `get`.
// ---------------------------------------------------------------------------

export class PgDataSourceManager {
  private readonly sources: Map<string, PgDataSource>
  readonly defaultDbName: string

  constructor(
    config: PgConfigMetadata,
    factory?: PoolFactory,
    defaultDbName = 'default',
  ) {
    this.defaultDbName = defaultDbName
    this.sources = new Map()
    for (const [dbName, dbConfig] of Object.entries(config.databases)) {
      this.sources.set(dbName, new PgDataSource(dbConfig, config.pool, factory))
    }
  }

  /** Return the datasource for `dbName`, or the default one when omitted. */
  get(dbName?: string): PgDataSource {
    const name = dbName ?? this.defaultDbName
    const ds = this.sources.get(name)
    if (!ds) {
      const available = [...this.sources.keys()].join(', ') || '(none)'
      throw new Error(`No PostgreSQL datasource configured for dbName "${name}". Available: ${available}.`)
    }
    return ds
  }

  /** Whether a datasource exists for `dbName`. */
  has(dbName: string): boolean {
    return this.sources.has(dbName)
  }

  /** All configured database names. */
  get dbNames(): string[] {
    return [...this.sources.keys()]
  }

  /** Close every datasource. */
  async endAll(): Promise<void> {
    await Promise.all([...this.sources.values()].map(ds => ds.end()))
  }
}
