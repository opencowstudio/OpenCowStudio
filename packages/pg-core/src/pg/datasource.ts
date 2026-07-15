import { Pool } from 'pg'
import {
  toConnectionOptions,
  type PgConnectionOptions,
  type PgDatabaseConfig,
  type PgDataSourceConfig,
  type PgPoolConfig,
} from './config.ts'

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

/** Builds a pool from resolved connection options. Injectable for testing. */
export type PoolFactory = (options: PgConnectionOptions) => PoolLike

/** Default factory: a real node-postgres connection pool. */
function defaultPoolFactory(options: PgConnectionOptions): PoolLike {
  return new Pool(options)
}

// ---------------------------------------------------------------------------
// PgDataSource — one database (master + read replicas)
// ---------------------------------------------------------------------------

export class PgDataSource {
  readonly master: PoolLike
  readonly slaves: PoolLike[]
  private slaveCursor = 0

  constructor(
    database: PgDatabaseConfig,
    pool: PgPoolConfig,
    factory: PoolFactory = defaultPoolFactory,
  ) {
    this.master = factory(toConnectionOptions(database.master, pool))
    this.slaves = database.slaves.map(s => factory(toConnectionOptions(s, pool)))
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
// PgDataSourceManager — multi-database registry keyed by dbName
//
// The `dbName` of an entity (see @PgEntity) resolves to one of these
// datasources. Unknown names throw so misconfiguration fails fast.
// ---------------------------------------------------------------------------

export class PgDataSourceManager {
  private readonly sources: Map<string, PgDataSource>
  readonly defaultDbName: string

  constructor(
    config: PgDataSourceConfig,
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
