import { Pool } from 'pg'
import { consola } from 'consola'
import { PgSqlTemplate } from './sql'
import type {
  PgConfigMetadata,
  PgDatabaseMetadata,
  PgNodeMetadata,
  PgPoolMetadata,
} from '../shared/types.ts'

// Tagged logger so the core stays framework-agnostic (no Nuxt dep).
const logger = consola.withTag('pg-datasource')

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
// Startup initialization — PostgreSQL extensions
//
// An extension is a per-database object, so it is created once on the master
// node and reaches the read replicas through streaming replication. Creating it
// on a replica is impossible anyway (replicas are read-only), which is why the
// bootstrap always talks to the master pool.
//
// `pg_trgm` is the only extension the ORM depends on: it provides the trigram
// machinery behind fuzzy text search and the GIN indexes that make it fast.
// Its `CREATE EXTENSION IF NOT EXISTS` statement is idempotent, so running it
// on every boot is cheap and safe — it is a no-op once the extension exists.
// The statement itself lives in `PgSqlTemplate` and is never assembled here.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PgDataSource — one database (master + read replicas)
// ---------------------------------------------------------------------------

export class PgDataSource {
  readonly master: Pool
  readonly slaves: Pool[]
  private slaveCursor = 0

  constructor(database: PgDatabaseMetadata, pool: PgPoolMetadata, dbName = 'default') {
    this.master = defaultPoolFactory(database.master, pool)
    this.slaves = database.slaves.map(s => defaultPoolFactory(s, pool))
    // Triggered, not awaited: the bootstrap reports its outcome through the
    // log and nothing here depends on it having finished.
    void this.createExtensions(dbName)
  }

  /**
   * Create the `pg_trgm` extension on the master node.
   *
   * Fire-and-forget by design: the DDL is triggered at construction time and
   * its outcome is reported through the log. Missing privileges, an unreachable
   * master or a missing contrib module are not fatal here — the features that
   * depend on the extension fail later with their own explicit error.
   */
  private async createExtensions(dbName: string): Promise<void> {
    logger.info(
      `Database "${dbName}": ensuring the PostgreSQL extension "pg_trgm" on the master ...`,
    )

    try {
      await this.master.query(PgSqlTemplate.CREATE_EXTENSION_PG_TRGM)
      logger.success(`Database "${dbName}": PostgreSQL extension "pg_trgm" ready`)
    } catch (err) {
      logger.error(
        `Database "${dbName}": failed to create the PostgreSQL extension "pg_trgm". ` +
          'Creating an extension requires superuser (or equivalent) privileges; ' +
          'features depending on it will fail until it is created manually.',
        err,
      )
    }
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
    // Each datasource triggers its own extension bootstrap in the background.
    for (const [dbName, dbConfig] of Object.entries(config.databases)) {
      this.sources.set(dbName, new PgDataSource(dbConfig, config.pool, dbName))
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
