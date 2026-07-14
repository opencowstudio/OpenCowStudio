import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'

// ---------------------------------------------------------------------------
// Configuration types
//
// A project provides a single YAML file (default: pg.config.yaml at the
// project root) describing one shared pool and one or more databases. Each
// database is keyed by `dbName` and owns a master node plus an optional list
// of read-replica (slave) nodes. The entity decorator's `dbName` option maps
// directly to these keys.
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

/** Top-level datasource configuration loaded from the project file. */
export interface PgDataSourceConfig {
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
// YAML loading & validation
// ---------------------------------------------------------------------------

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid pg config: "${path}" is required and must be a number.`)
  }
  return value
}

function normalizePool(raw: unknown): PgPoolConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid pg config: "pool" section is required.')
  }
  const pool = raw as Record<string, unknown>

  // Backwards-compat: tolerate the common "idleTtimeoutMillis" typo.
  let idleTimeoutMillis = pool.idleTimeoutMillis
  if (idleTimeoutMillis === undefined && pool.idleTtimeoutMillis !== undefined) {
    idleTimeoutMillis = pool.idleTtimeoutMillis
    // eslint-disable-next-line no-console
    console.warn('[pg] "pool.idleTtimeoutMillis" is a typo; use "idleTimeoutMillis". It has been accepted for compatibility.')
  }

  return {
    max: requireNumber(pool.max, 'pool.max'),
    min: requireNumber(pool.min, 'pool.min'),
    idleTimeoutMillis: requireNumber(idleTimeoutMillis, 'pool.idleTimeoutMillis'),
    maxLifetimeSeconds: requireNumber(pool.maxLifetimeSeconds, 'pool.maxLifetimeSeconds'),
  }
}

function normalizeNode(raw: unknown, path: string): PgNodeConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid pg config: node "${path}" must be a mapping with url/username/password.`)
  }
  const node = raw as Record<string, unknown>
  const { url, username, password } = node
  if (typeof url !== 'string' || !url) {
    throw new Error(`Invalid pg config: node "${path}".url is required and must be a string.`)
  }
  if (typeof username !== 'string') {
    throw new Error(`Invalid pg config: node "${path}".username is required and must be a string.`)
  }
  if (typeof password !== 'string') {
    throw new Error(`Invalid pg config: node "${path}".password is required and must be a string.`)
  }
  return { url, username, password }
}

function normalizeDatabase(raw: unknown, dbName: string): PgDatabaseConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid pg config: database "${dbName}" must be a mapping with "master" and optional "slaves".`)
  }
  const db = raw as Record<string, unknown>
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

function normalizeDatabases(raw: unknown): Record<string, PgDatabaseConfig> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid pg config: "databases" section is required and must map dbName -> { master, slaves }.')
  }
  const databases = raw as Record<string, unknown>
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

/** Parse and validate a YAML string into a typed datasource config. */
export function loadPgConfigFromYaml(content: string): PgDataSourceConfig {
  const raw = parseYaml(content)
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid pg config: expected a YAML mapping at the top level.')
  }
  const doc = raw as Record<string, unknown>
  const pool = normalizePool(doc.pool)
  const databases = normalizeDatabases(doc.databases)
  return { pool, databases }
}

/** Read a config file from disk and parse it. */
export function loadPgConfigFromFile(path: string): PgDataSourceConfig {
  const content = readFileSync(path, 'utf8')
  return loadPgConfigFromYaml(content)
}
