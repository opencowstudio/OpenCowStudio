import { consola } from 'consola'
import type {
  BooleanLike,
  PgColumnMetadata,
  PgColumnOptions,
  PgColumnRaw,
  PgColumnType,
  PgEntityMetadata,
  PgEntityOptions,
  PgEntityRaw,
  PgIndexMetadata,
  PgKeyMetadata,
  PgKeyOptions,
  PgKeyRaw,
} from './types.ts'

// Tagged logger so the core stays framework-agnostic (no Nuxt dep).
const logger = consola.withTag('pg')

// ---------------------------------------------------------------------------
// Symbol keys used to store raw decorator input on the class constructor
// ---------------------------------------------------------------------------

/** Convert a string (typically a field name) to snake_case. */
function toSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

// ---------------------------------------------------------------------------
// Identifier validation — PostgreSQL names (db / schema / table / column /
// index column) must match this pattern. Names are validated at resolution
// time; an invalid name throws and logs detailed diagnostics.
// ---------------------------------------------------------------------------

/** Allowed pattern for PostgreSQL identifiers: alphanumeric and underscore. */
const IDENTIFIER_RE = /^[a-zA-Z0-9_]+$/

/**
 * Validate that `value` is a legal PostgreSQL identifier.
 *
 * Throws an Error (with detailed context) and logs to stderr when invalid.
 * Empty/undefined values are treated as "not provided" and skipped — callers
 * are responsible for applying their own defaults before/after validation.
 */
function assertValidIdentifier(value: string, kind: string, context: string): void {
  if (!IDENTIFIER_RE.test(value)) {
    const message = `Invalid ${kind} "${value}": must match ${IDENTIFIER_RE} (alphanumeric and underscore only). Context: ${context}`
    logger.error(message)
    throw new Error(message)
  }
}

// ---------------------------------------------------------------------------
// Column type validation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Boolean normalisation — string forms accepted by BooleanLike options are
// coerced to a real boolean during metadata resolution.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Raw decorator storage — the decorators only record their *original* options
// here; no validation, defaulting or type conversion happens at decoration
// time. All of that lives in `resolvePgEntityRaw`.
// ---------------------------------------------------------------------------

const ENTITY_RAW = Symbol('pg:entityRaw')
const KEYS_RAW = Symbol('pg:keysRaw')
const COLUMNS_RAW = Symbol('pg:columnsRaw')

interface EntityRawHolder {
  [ENTITY_RAW]?: { className: string, options: PgEntityOptions }
}

interface KeysRawHolder {
  [KEYS_RAW]?: Map<string | symbol, PgKeyRaw>
}

interface ColumnsRawHolder {
  [COLUMNS_RAW]?: Map<string | symbol, PgColumnRaw>
}

function getEntityRaw(target: object): { className: string, options: PgEntityOptions } | undefined {
  return (target as EntityRawHolder)[ENTITY_RAW]
}

function getKeysRaw(target: object): Map<string | symbol, PgKeyRaw> | undefined {
  return (target as KeysRawHolder)[KEYS_RAW]
}

function getColumnsRaw(target: object): Map<string | symbol, PgColumnRaw> | undefined {
  return (target as ColumnsRawHolder)[COLUMNS_RAW]
}

/** Initialise (or return existing) key raw map on `target`. */
function ensureKeysRaw(target: object): Map<string | symbol, PgKeyRaw> {
  const holder = target as KeysRawHolder
  if (!holder[KEYS_RAW]) {
    holder[KEYS_RAW] = new Map()
  }
  return holder[KEYS_RAW]!
}

/** Initialise (or return existing) column raw map on `target`. */
function ensureColumnsRaw(target: object): Map<string | symbol, PgColumnRaw> {
  const holder = target as ColumnsRawHolder
  if (!holder[COLUMNS_RAW]) {
    holder[COLUMNS_RAW] = new Map()
  }
  return holder[COLUMNS_RAW]!
}

// ---------------------------------------------------------------------------
// Stage 1 — buildPgEntityRaw: read a class's decorators verbatim
//
// Assembles a `PgEntityRaw` from the raw decorator input stored on the class.
// This performs NO transformation: defaults are not applied, identifiers are
// not validated, and BooleanLike strings are not coerced. The field decorators
// register their raw input via `addInitializer`, which only runs when an
// instance is constructed, so the class must be instantiated before calling
// this.
// ---------------------------------------------------------------------------

/**
 * Build the unmodified `PgEntityRaw` for a single entity constructor.
 *
 * Returns `undefined` when the class is not decorated with `@PgEntity`. The
 * returned object holds the decorator options exactly as supplied — callers
 * must construct the entity first so field decorators have registered their
 * raw input. An entity must declare exactly one `@PgKey`; declaring zero or
 * more than one throws (with the offending property names) so the error
 * surfaces early.
 */
export function buildPgEntityRaw(ctor: Function): PgEntityRaw | undefined {
  const raw = getEntityRaw(ctor)
  if (!raw) return undefined
  const keysRaw = getKeysRaw(ctor)
  const columnsRaw = getColumnsRaw(ctor)

  // An entity must declare exactly one @PgKey — fail fast with a clear message.
  if (!keysRaw || keysRaw.size === 0) {
    const message = `Entity "${raw.className}" declares no @PgKey field; an entity must declare exactly one @PgKey.`
    logger.error(message)
    throw new Error(message)
  }
  if (keysRaw.size > 1) {
    const names = [...keysRaw.keys()].map(k => String(k)).join(', ')
    const message = `Entity "${raw.className}" declares multiple @PgKey fields (${names}); an entity must declare exactly one @PgKey.`
    logger.error(message)
    throw new Error(message)
  }

  const key = [...keysRaw.values()][0]!
  return {
    className: raw.className,
    options: raw.options,
    key,
    columns: columnsRaw ? [...columnsRaw.values()] : [],
  }
}

// ---------------------------------------------------------------------------
// Stage 2 — resolvePgEntityRaw: validate, default and normalise
//
// Converts a `PgEntityRaw` into the final `PgEntityMetadata`. This is where
// correctness is enforced: identifiers are validated, missing values get their
// defaults, and BooleanLike strings are coerced to real booleans.
// ---------------------------------------------------------------------------

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

  if (dbName) assertValidIdentifier(dbName, 'dbName', `entity ${className}`)
  assertValidIdentifier(schema, 'schema', `entity ${className}`)
  assertValidIdentifier(table, 'table', `entity ${className}`)
  for (const index of opts.indexes ?? []) {
    for (const col of index.columns) {
      assertValidIdentifier(col, 'index column', `entity ${className} index [${index.columns.join(', ')}]`)
    }
  }

  const indexes: PgIndexMetadata[] = (opts.indexes ?? []).map(idx => ({
    columns: idx.columns,
    unique: toBoolean(idx.unique, false, `entity ${className} index [${idx.columns.join(', ')}].unique`),
  }))

  const createTableAuto = toBoolean(opts.createTableAuto, true, `entity ${className}.createTableAuto`)
  const addColumnAuto = toBoolean(opts.addColumnAuto, true, `entity ${className}.addColumnAuto`)
  const createIndexAuto = toBoolean(opts.createIndexAuto, true, `entity ${className}.createIndexAuto`)

  // --- key field (exactly one) ---
  if (!raw.key) {
    const message = `Entity "${className}" has no @PgKey field; an entity must declare exactly one @PgKey.`
    logger.error(message)
    throw new Error(message)
  }
  const key: PgKeyMetadata = (() => {
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
  const columns: PgColumnMetadata[] = raw.columns.map((c) => {
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

// ---------------------------------------------------------------------------
// @PgKey — marks a property as a primary / unique key column
//
// Uses the native ES field decorator signature:
//   (value: undefined, context: ClassFieldDecoratorContext) => void
//
// Its `addInitializer` only records the raw options on the constructor; all
// validation/defaulting happens later in `resolvePgEntityRaw`. The one check
// that remains here guards the *instance field value* (a key must be a string
// at runtime), which is not part of the decorator options.
// ---------------------------------------------------------------------------

export function PgKey(options: PgKeyOptions = {}): <C, V>(
  value: undefined,
  context: ClassFieldDecoratorContext<C, V>,
) => void {
  return function (value: undefined, context: ClassFieldDecoratorContext): void {
    const propertyKey = context.name

    context.addInitializer(function (this: unknown): void {
      const klass = (this as Record<string | symbol, unknown>).constructor
      const value = (this as Record<string | symbol, unknown>)[propertyKey]
      if (value !== undefined && typeof value !== 'string') {
        const message = `Invalid PgKey field "${String(propertyKey)}" on ${klass.name || 'anonymous'}: key value must be a string, but got type "${typeof value}" (value: ${JSON.stringify(value)}).`
        logger.error(message)
        throw new Error(message)
      }
      const map = ensureKeysRaw(klass as object)
      map.set(propertyKey, { propertyKey, options })
    })
  }
}

// ---------------------------------------------------------------------------
// @PgColumn — marks a property as a regular table column
// ---------------------------------------------------------------------------

export function PgColumn(options: PgColumnOptions = {}): <C, V>(
  value: undefined,
  context: ClassFieldDecoratorContext<C, V>,
) => void {
  return function (value: undefined, context: ClassFieldDecoratorContext): void {
    const propertyKey = context.name

    context.addInitializer(function (this: unknown): void {
      const klass = (this as Record<string | symbol, unknown>).constructor
      const map = ensureColumnsRaw(klass as object)
      map.set(propertyKey, { propertyKey, options })
    })
  }
}

// ---------------------------------------------------------------------------
// @PgEntity — marks a class as a PostgreSQL entity (table)
//
// Uses the native ES class decorator signature:
//   (value: Function, context: ClassDecoratorContext) => Function | void
// ---------------------------------------------------------------------------

export function PgEntity(options: PgEntityOptions = {}): <C extends abstract new (...args: unknown[]) => unknown>(
  value: C,
  context: ClassDecoratorContext<C>,
) => C | void {
  return function (value: Function, context: ClassDecoratorContext): void {
    const target = value as object
    const holder = target as EntityRawHolder
    holder[ENTITY_RAW] = { className: value.name, options }
    // pre-initialise the key / column raw maps so field decorators can use them
    ensureKeysRaw(target)
    ensureColumnsRaw(target)
  }
}
