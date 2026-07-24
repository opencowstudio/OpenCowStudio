import { consola } from 'consola'
import type { BooleanLike, PgColumnType } from '../decorators.ts'
import type { PgEntityMetadata, PgEntityRaw } from '../types.ts'

// Tagged logger so the core stays framework-agnostic (no Nuxt dep).
const logger = consola.withTag('pg-repository')

// ---------------------------------------------------------------------------
// Entity repository (runtime)
//
// Turns a statically-parsed `PgEntityRaw` (produced by `builder/parser.ts`)
// into fully-validated, defaulted `PgEntityMetadata`. This is where correctness
// is enforced: identifiers are validated, missing values get their defaults,
// and BooleanLike strings are coerced to real booleans.
// ---------------------------------------------------------------------------

/** Convert a string (typically a field name) to snake_case. */
function toSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

/** Allowed pattern for PostgreSQL identifiers: alphanumeric and underscore. */
const IDENTIFIER_RE = /^[a-zA-Z0-9_]+$/

/**
 * Validate that `value` is a legal PostgreSQL identifier.
 *
 * Throws an Error (with detailed context) and logs to stderr when invalid.
 */
function assertValidIdentifier(value: string, kind: string, context: string): void {
  if (!IDENTIFIER_RE.test(value)) {
    const message = `Invalid ${kind} "${value}": must match ${IDENTIFIER_RE} (alphanumeric and underscore only). Context: ${context}`
    logger.error(message)
    throw new Error(message)
  }
}

/** Allowed logical SQL column types. */
const COLUMN_TYPES: ReadonlySet<string> = new Set<PgColumnType>([
  'BIGINT',
  'DOUBLE',
  'BOOLEAN',
  'JSON_OBJECT',
  'JSON_ARRAY',
  'TEXT',
  'DATE',
])

/**
 * Validate and normalise a declared column type.
 *
 * Throws an Error (with detailed context) and logs to stderr when the value
 * is missing or not one of the allowed column types.
 */
function resolveColumnType(value: PgColumnType | undefined, context: string): PgColumnType {
  if (value === undefined) {
    const message = `Missing required columnType for ${context}. Expected one of: ${[...COLUMN_TYPES].join(', ')}.`
    logger.error(message)
    throw new Error(message)
  }
  if (!COLUMN_TYPES.has(value)) {
    const message = `Invalid columnType "${value}" for ${context}. Expected one of: ${[...COLUMN_TYPES].join(', ')}.`
    logger.error(message)
    throw new Error(message)
  }
  return value
}

/**
 * Normalise a `BooleanLike` value to a boolean.
 *
 * `undefined` falls back to `fallback`. Real booleans pass through. Strings
 * `'true'`/`'1'` become `true`; `'false'`/`'0'` become `false`. Any other
 * string is rejected (logged + thrown) because the raw value is invalid.
 */
function toBoolean(value: BooleanLike | undefined, fallback: boolean, context: string): boolean {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  const normalised = value.trim().toLowerCase()
  if (normalised === 'true' || normalised === '1') return true
  if (normalised === 'false' || normalised === '0') return false
  const message = `Invalid boolean value "${value}" for ${context}: expected true/false or the strings "true"/"false".`
  logger.error(message)
  throw new Error(message)
}

/**
 * Resolve a `PgEntityRaw` into fully-validated `PgEntityMetadata`.
 *
 * Throws (with detailed diagnostics) when any identifier is illegal, a
 * required `columnType` is missing/invalid, or a BooleanLike string cannot be
 * parsed as a boolean.
 */
export function resolvePgEntityRaw(raw: PgEntityRaw): PgEntityMetadata {
  const className = raw.className
  const opts = raw.options

  // --- entity-level identifiers & defaults ---
  const dbName = opts.dbName?.trim() ? opts.dbName : 'default'
  const schema = opts.schema?.trim() ? opts.schema : 'public'
  const table = opts.table?.trim() ? opts.table : toSnakeCase(className)

  assertValidIdentifier(dbName, 'dbName', `entity ${className}`)
  assertValidIdentifier(schema, 'schema', `entity ${className}`)
  assertValidIdentifier(table, 'table', `entity ${className}`)
  for (const index of raw.indexes) {
    for (const col of index.options.columns) {
      assertValidIdentifier(
        col,
        'index column',
        `entity ${className} index [${index.options.columns.join(', ')}]`,
      )
    }
  }

  const indexes = raw.indexes.map((index) => {
    const ctx = `entity ${className} index [${index.options.columns.join(', ')}]`
    return {
      columns: index.options.columns,
      unique: toBoolean(index.options.unique, false, `${ctx}.unique`),
    }
  })

  const createTableAuto = toBoolean(opts.createTableAuto, true, `entity ${className}.createTableAuto`)
  const addColumnAuto = toBoolean(opts.addColumnAuto, true, `entity ${className}.addColumnAuto`)
  const createIndexAuto = toBoolean(opts.createIndexAuto, true, `entity ${className}.createIndexAuto`)

  // --- key field (exactly one) ---
  if (!raw.key) {
    const message = `Entity "${className}" has no @PgKey field; an entity must declare exactly one @PgKey.`
    logger.error(message)
    throw new Error(message)
  }
  const key = (() => {
    const propertyKey = String(raw.key.propertyKey)
    const column = raw.key.options.column?.trim() ? raw.key.options.column : toSnakeCase(propertyKey)
    assertValidIdentifier(column, 'column', `key ${propertyKey} on ${className}`)
    return {
      propertyKey,
      column,
      generated: toBoolean(raw.key.options.generated, true, `key ${propertyKey}.generated on ${className}`),
      comment: raw.key.options.comment ?? '',
    }
  })()

  // --- column fields ---
  const columns = raw.columns.map((c) => {
    const propertyKey = String(c.propertyKey)
    const column = c.options.column?.trim() ? c.options.column : toSnakeCase(propertyKey)
    assertValidIdentifier(column, 'column', `column ${propertyKey} on ${className}`)
    const columnType = resolveColumnType(c.options.columnType, `column ${propertyKey} on ${className}`)
    return {
      propertyKey,
      column,
      comment: c.options.comment ?? '',
      columnType,
    }
  })

  return {
    dbName,
    schema,
    table,
    comment: opts.comment ?? '',
    createTableAuto,
    addColumnAuto,
    createIndexAuto,
    indexes,
    key,
    columns,
  }
}
