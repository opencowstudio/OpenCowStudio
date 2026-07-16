// ---------------------------------------------------------------------------
// Configuration metadata
//
// A project defines its PostgreSQL datasource configuration *in code* as a
// typed metadata object (see `definePgConfig`). The metadata describes one
// shared pool and one or more databases. Each database is keyed by `dbName`
// and owns a master node plus an optional list of read-replica (slave) nodes.
// The entity decorator's `dbName` option maps directly to these keys.
// ---------------------------------------------------------------------------

/** Shared connection-pool tuning applied to every node. */
export interface PgPoolConfig {
  /** maximum number of clients in the pool */
  max: number
  /** minimum number of clients kept alive in the pool */
  min: number
  /** idle timeout of a client before it is closed (milliseconds) */
  idleTimeoutMillis: number
  /** maximum lifetime of a client before it is recycled (seconds) */
  maxLifetimeSeconds: number
}

/** A single PostgreSQL node (master or slave): a standard URL + credentials. */
export interface PgNodeConfig {
  /** standard PostgreSQL URL, e.g. postgresql://host:port/db */
  url: string
  username: string
  password: string
}

/** One database: a master plus an optional list of read replicas. */
export interface PgDatabaseConfig {
  master: PgNodeConfig
  slaves: PgNodeConfig[]
}

/** Top-level datasource configuration metadata defined in code. */
export interface PgConfigMetadata {
  pool: PgPoolConfig
  databases: Record<string, PgDatabaseConfig>
}

/** Resolved options handed to a pool factory (node + pool merged). */
export interface PgConnectionOptions {
  host: string
  port: number
  database: string
  user: string
  password: string
  max: number
  min: number
  idleTimeoutMillis: number
  maxLifetimeSeconds: number
}

const DEFAULT_PG_PORT = 5432

// ---------------------------------------------------------------------------
// URL parsing — standard PostgreSQL connection strings only
// ---------------------------------------------------------------------------

/**
 * Parse a standard PostgreSQL URL into host / port / database.
 *
 * Throws a descriptive error for non-postgres protocols, missing hosts, or
 * non-numeric ports. The JDBC-style `jdbc:postgresql://` prefix is NOT
 * supported; callers must provide a plain `postgresql://` URL.
 */
export function parsePgUrl(url: string): { host: string; port: number; database: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    throw new Error(`Invalid PostgreSQL URL "${url}": must be a valid connection string (e.g. postgresql://host:port/db).`)
  }

  const { protocol } = parsed
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    throw new Error(`Invalid PostgreSQL URL "${url}": protocol must be "postgresql:" or "postgres:" (got "${protocol}").`)
  }

  const host = parsed.hostname
  if (!host) {
    throw new Error(`Invalid PostgreSQL URL "${url}": missing host.`)
  }

  const port = parsed.port ? Number(parsed.port) : DEFAULT_PG_PORT
  if (Number.isNaN(port)) {
    throw new Error(`Invalid PostgreSQL URL "${url}": port "${parsed.port}" is not a number.`)
  }

  const database = parsed.pathname.replace(/^\/+/, '')
  return { host, port, database }
}

/**
 * Merge a node's credentials with the shared pool config into the flat
 * options a pool factory (e.g. node-postgres `Pool`) expects.
 */
export function toConnectionOptions(node: PgNodeConfig, pool: PgPoolConfig): PgConnectionOptions {
  const { host, port, database } = parsePgUrl(node.url)
  return {
    host,
    port,
    database,
    user: node.username,
    password: node.password,
    max: pool.max,
    min: pool.min,
    idleTimeoutMillis: pool.idleTimeoutMillis,
    maxLifetimeSeconds: pool.maxLifetimeSeconds,
  }
}

// ---------------------------------------------------------------------------
// Metadata validation
// ---------------------------------------------------------------------------

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid pg config: "${path}" is required and must be a number.`)
  }
  return value
}

function normalizePool(pool: PgPoolConfig): PgPoolConfig {
  return {
    max: requireNumber(pool.max, 'pool.max'),
    min: requireNumber(pool.min, 'pool.min'),
    idleTimeoutMillis: requireNumber(pool.idleTimeoutMillis, 'pool.idleTimeoutMillis'),
    maxLifetimeSeconds: requireNumber(pool.maxLifetimeSeconds, 'pool.maxLifetimeSeconds'),
  }
}

function normalizeNode(node: PgNodeConfig, path: string): PgNodeConfig {
  if (typeof node.url !== 'string' || !node.url) {
    throw new Error(`Invalid pg config: node "${path}".url is required and must be a string.`)
  }
  if (typeof node.username !== 'string') {
    throw new Error(`Invalid pg config: node "${path}".username is required and must be a string.`)
  }
  if (typeof node.password !== 'string') {
    throw new Error(`Invalid pg config: node "${path}".password is required and must be a string.`)
  }
  // Fail fast on a malformed URL rather than at pool-creation time.
  parsePgUrl(node.url)
  return { url: node.url, username: node.username, password: node.password }
}

function normalizeDatabase(db: PgDatabaseConfig, dbName: string): PgDatabaseConfig {
  if (!db.master || typeof db.master !== 'object') {
    throw new Error(`Invalid pg config: database "${dbName}" requires a "master" node.`)
  }

  const master = normalizeNode(db.master, `${dbName}.master`)

  let slaves: PgNodeConfig[] = []
  if (db.slaves !== undefined && db.slaves !== null) {
    if (!Array.isArray(db.slaves)) {
      throw new Error(`Invalid pg config: database "${dbName}".slaves must be a list.`)
    }
    slaves = db.slaves.map((s, i) => normalizeNode(s, `${dbName}.slaves[${i}]`))
  }

  return { master, slaves }
}

function normalizeDatabases(databases: Record<string, PgDatabaseConfig>): Record<string, PgDatabaseConfig> {
  if (!databases || typeof databases !== 'object') {
    throw new Error('Invalid pg config: "databases" section is required and must map dbName -> { master, slaves }.')
  }
  const out: Record<string, PgDatabaseConfig> = {}
  for (const [dbName, dbRaw] of Object.entries(databases)) {
    if (!dbName) {
      throw new Error('Invalid pg config: database name must not be empty.')
    }
    out[dbName] = normalizeDatabase(dbRaw, dbName)
  }
  if (Object.keys(out).length === 0) {
    throw new Error('Invalid pg config: "databases" must contain at least one database.')
  }
  return out
}

/**
 * Define and validate the PostgreSQL datasource configuration as code.
 *
 * The returned, normalized metadata is what `PgDataSourceManager` consumes to
 * build its connection pools. Validation fails fast with a descriptive error
 * so misconfiguration surfaces at startup rather than at query time.
 */
export function definePgConfig(metadata: PgConfigMetadata): PgConfigMetadata {
  const pool = normalizePool(metadata.pool)
  const databases = normalizeDatabases(metadata.databases)
  return { pool, databases }
}
