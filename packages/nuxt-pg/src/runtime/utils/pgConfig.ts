import { consola } from 'consola'
import type {
  PgConfigMetadata,
  PgDatabaseMetadata,
  PgNodeMetadata,
  PgPoolMetadata,
} from '@opencowstudio/pg-core'

const logger = consola.withTag('nuxt-pg')

/**
 * Thrown when a plain JSON value cannot be coerced into the expected
 * `PgConfigMetadata` shape. Carries the offending config path, the expected
 * type, and the raw value so callers can emit a detailed diagnostic.
 */
export class PgConfigParseError extends Error {
  readonly path: string
  readonly expected: string
  readonly value: unknown

  constructor(path: string, expected: string, value: unknown) {
    super(
      `Invalid pg config value at "${path}": expected ${expected} but received ${describeValue(value)} (type "${typeof value}").`,
    )
    this.name = 'PgConfigParseError'
    this.path = path
    this.expected = expected
    this.value = value
  }
}

/** Human-readable, single-line description of an arbitrary value for logging. */
function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Coerce a value to a number. Accepts numeric strings (e.g. the YAML string
 * `"18"`) so a config authored as text still resolves to a real number.
 */
function coerceNumber(value: unknown, path: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new PgConfigParseError(path, 'number', value)
    }
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') {
      throw new PgConfigParseError(path, 'number', value)
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      throw new PgConfigParseError(path, 'number', value)
    }
    return n
  }
  throw new PgConfigParseError(path, 'number', value)
}

/**
 * Coerce a value to a string. Accepts numbers/booleans too, because an
 * unquoted YAML value like `password: 1234` is parsed as a number and should
 * still be usable as a credential string.
 */
function coerceString(value: unknown, path: string): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  throw new PgConfigParseError(path, 'string', value)
}

function toNodeMeta(raw: unknown, path: string): PgNodeMetadata {
  if (!isPlainObject(raw)) {
    throw new PgConfigParseError(path, 'object', raw)
  }
  return {
    url: coerceString(raw.url, `${path}.url`),
    username: coerceString(raw.username, `${path}.username`),
    password: coerceString(raw.password, `${path}.password`),
  }
}

function toPoolMeta(raw: unknown, path: string): PgPoolMetadata {
  if (!isPlainObject(raw)) {
    throw new PgConfigParseError(path, 'object', raw)
  }
  return {
    max: coerceNumber(raw.max, `${path}.max`),
    min: coerceNumber(raw.min, `${path}.min`),
    idleTimeoutMillis: coerceNumber(raw.idleTimeoutMillis, `${path}.idleTimeoutMillis`),
    maxLifetimeSeconds: coerceNumber(raw.maxLifetimeSeconds, `${path}.maxLifetimeSeconds`),
  }
}

function toDatabaseMeta(raw: unknown, path: string): PgDatabaseMetadata {
  if (!isPlainObject(raw)) {
    throw new PgConfigParseError(path, 'object', raw)
  }

  const master = toNodeMeta(raw.master, `${path}.master`)

  const slavesRaw = raw.slaves
  let slaves: PgNodeMetadata[]
  if (slavesRaw === undefined || slavesRaw === null) {
    slaves = []
  } else if (Array.isArray(slavesRaw)) {
    slaves = slavesRaw.map((s, i) => toNodeMeta(s, `${path}.slaves[${i}]`))
  } else {
    throw new PgConfigParseError(`${path}.slaves`, 'array', slavesRaw)
  }

  return { master, slaves }
}

/**
 * Fault-tolerant conversion of a plain JSON object (as produced by parsing the
 * build-time `#pg-manifest` string) into a typed `PgConfigMetadata`.
 *
 * String values are automatically coerced to their target types — e.g. the
 * pool field `max` authored as the YAML string `"18"` is parsed into the
 * number `18`. When coercion fails, a detailed error is logged and a
 * `PgConfigParseError` is thrown.
 *
 * @param raw The parsed JSON value (already `JSON.parse`-ed from the manifest).
 * @param rootPath Used to build human-readable paths in error messages.
 */
export function parsePgConfig(raw: unknown, rootPath = 'pg'): PgConfigMetadata {
  try {
    if (!isPlainObject(raw)) {
      throw new PgConfigParseError(rootPath, 'object', raw)
    }

    const pool = toPoolMeta(raw.pool, `${rootPath}.pool`)

    const databasesRaw = raw.databases
    if (!isPlainObject(databasesRaw)) {
      throw new PgConfigParseError(`${rootPath}.databases`, 'object', databasesRaw)
    }

    const databases: Record<string, PgDatabaseMetadata> = {}
    for (const [dbName, dbRaw] of Object.entries(databasesRaw)) {
      databases[dbName] = toDatabaseMeta(dbRaw, `${rootPath}.databases.${dbName}`)
    }

    return { pool, databases }
  } catch (err) {
    if (err instanceof PgConfigParseError) {
      logger.error(`Failed to build pg config metadata: ${err.message}`)
    } else {
      logger.error('Failed to build pg config metadata:', err)
    }
    throw err
  }
}
