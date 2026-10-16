import type {
  PgConfigMetadata,
  PgDatabaseMetadata,
  PgNodeMetadata,
  PgPoolMetadata,
} from '@opencowstudio/pg-core'

/**
 * Thrown when the `pg` namespace of the config file cannot be coerced into the
 * expected `PgConfigMetadata` shape. Carries the offending config path, the
 * expected type, and the raw value so callers can emit a detailed diagnostic.
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

/** Human-readable, single-line description of an arbitrary value for messages. */
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
 * still be usable as a credential string. `${VAR:default}` placeholders are
 * left intact — they are resolved from the environment at runtime.
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
 * Fault-tolerant conversion of the `pg` namespace read from the config file
 * into a typed `PgConfigMetadata`, performed once at build time so the manifest
 * can bake the already-typed metadata and the runtime can consume it directly.
 *
 * String values are automatically coerced to their target types — e.g. the
 * pool field `max` authored as the YAML string `"18"` is parsed into the
 * number `18`. When coercion fails, a `PgConfigParseError` carrying the
 * offending config path is thrown so the build fails loudly.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @param raw The raw `pg` namespace parsed from the config file's YAML.
 * @param rootPath Used to build human-readable paths in error messages.
 */
export function parsePgConfig(raw: unknown, rootPath = 'pg'): PgConfigMetadata {
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
}
