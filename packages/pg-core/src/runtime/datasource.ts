import { Pool } from 'pg'
import type {
  PgConfigMetadata,
  PgDatabaseMetadata,
  PgNodeMetadata,
  PgPoolMetadata,
} from '../types.ts'

// ---------------------------------------------------------------------------
// Pool creation
//
// Every node is wired up through `defaultPoolFactory`, which builds a real
// node-postgres `Pool` from the node and pool metadata.
// ---------------------------------------------------------------------------

const DEFAULT_PG_PORT = 5432

/** Build a real node-postgres connection pool directly from the node metadata. */
function defaultPoolFactory(node: PgNodeMetadata, pool: PgPoolMetadata): Pool {
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
  readonly master: Pool
  readonly slaves: Pool[]
  private slaveCursor = 0

  constructor(database: PgDatabaseMetadata, pool: PgPoolMetadata) {
    this.master = defaultPoolFactory(database.master, pool)
    this.slaves = database.slaves.map(s => defaultPoolFactory(s, pool))
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

  constructor(config: PgConfigMetadata, defaultDbName = 'default') {
    this.defaultDbName = defaultDbName
    this.sources = new Map()
    for (const [dbName, dbConfig] of Object.entries(config.databases)) {
      this.sources.set(dbName, new PgDataSource(dbConfig, config.pool))
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
