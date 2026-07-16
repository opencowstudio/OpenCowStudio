import type {
  PgColumnMetadata,
  PgColumnOptions,
  PgColumnType,
  PgEntityMetadata,
  PgEntityOptions,
  PgKeyMetadata,
  PgKeyOptions,
} from './types.ts'

// Lightweight console logger so the core stays framework-agnostic (no Nuxt dep).
const logger = {
  info: (...args: unknown[]): void => console.log('[pg]', ...args),
  error: (...args: unknown[]): void => console.error('[pg]', ...args),
}

// ---------------------------------------------------------------------------
// Symbol keys used to store metadata on the class constructor
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

const ENTITY_METADATA = Symbol('pg:entity')
const KEY_METADATA = Symbol('pg:key')
const COLUMN_METADATA = Symbol('pg:column')
/** Marks an entity whose field initializers have been run (constructed once). */
const FINALIZED = Symbol('pg:entity:finalized')
/** Cache for the fully-assembled entity metadata on a constructor. */
const RESOLVED_METADATA = Symbol('pg:entity:resolved')

/**
 * Registry of every class decorated with @PgEntity, keyed by constructor.
 * Populated at class-definition time so entity metadata can be resolved
 * without manual construction by the consumer.
 */
const ENTITY_REGISTRY = new Map<Function, PgEntityOptions>()

// ---------------------------------------------------------------------------
// Typed accessor helpers — attach metadata to a plain symbol key on `object`
// ---------------------------------------------------------------------------

interface EntityMetadataHolder {
  [ENTITY_METADATA]?: PgEntityMetadata
}

interface KeyMetadataHolder {
  [KEY_METADATA]?: Map<string | symbol, PgKeyMetadata>
}

interface ColumnMetadataHolder {
  [COLUMN_METADATA]?: Map<string | symbol, PgColumnMetadata>
}

function getEntityMetadata(target: object): PgEntityMetadata | undefined {
  return (target as EntityMetadataHolder)[ENTITY_METADATA]
}

function getKeysMetadata(target: object): Map<string | symbol, PgKeyMetadata> | undefined {
  return (target as KeyMetadataHolder)[KEY_METADATA]
}

function getColumnsMetadata(target: object): Map<string | symbol, PgColumnMetadata> | undefined {
  return (target as ColumnMetadataHolder)[COLUMN_METADATA]
}

/** Initialise (or return existing) entity metadata on `target`. */
function ensureEntityMetadata(target: object, opts: PgEntityOptions, className: string): PgEntityMetadata {
  const holder = target as EntityMetadataHolder
  if (!holder[ENTITY_METADATA]) {
    const dbName = opts.dbName ?? 'default'
    const schema = opts.schema?.trim() ? opts.schema : 'public'
    const table = opts.table?.trim() ? opts.table : toSnakeCase(className)

    // Validate resolved identifier names (dbName defaults to "default" connection).
    if (dbName) assertValidIdentifier(dbName, 'dbName', `entity ${className}`)
    assertValidIdentifier(schema, 'schema', `entity ${className}`)
    assertValidIdentifier(table, 'table', `entity ${className}`)
    for (const index of opts.indexes ?? []) {
      for (const col of index.columns) {
        assertValidIdentifier(col, 'index column', `entity ${className} index [${index.columns.join(', ')}]`)
      }
    }

    holder[ENTITY_METADATA] = {
      dbName,
      schema,
      table,
      comment: opts.comment ?? '',
      createTableAuto: opts.createTableAuto ?? true,
      addColumnAuto: opts.addColumnAuto ?? true,
      createIndexAuto: opts.createIndexAuto ?? true,
      indexes: opts.indexes ?? [],
      keys: [],
      columns: [],
    }
  }
  return holder[ENTITY_METADATA]!
}

/** Initialise (or return existing) key metadata map on `target`. */
function ensureKeysMetadata(target: object): Map<string | symbol, PgKeyMetadata> {
  const holder = target as KeyMetadataHolder
  if (!holder[KEY_METADATA]) {
    holder[KEY_METADATA] = new Map()
  }
  return holder[KEY_METADATA]!
}

/** Initialise (or return existing) column metadata map on `target`. */
function ensureColumnsMetadata(target: object): Map<string | symbol, PgColumnMetadata> {
  const holder = target as ColumnMetadataHolder
  if (!holder[COLUMN_METADATA]) {
    holder[COLUMN_METADATA] = new Map()
  }
  return holder[COLUMN_METADATA]!
}

// ---------------------------------------------------------------------------
// @PgKey — marks a property as a primary / unique key column
//
// Uses the native ES field decorator signature:
//   (value: undefined, context: ClassFieldDecoratorContext) => void
//
// Metadata is stored on the *constructor* via `addInitializer`, which runs
// once after all decorators have been applied to the class.
// ---------------------------------------------------------------------------

export function PgKey(options: PgKeyOptions = {}): <C, V>(
  value: undefined,
  context: ClassFieldDecoratorContext<C, V>,
) => void {
  return function (value: undefined, context: ClassFieldDecoratorContext): void {
    const propertyKey = context.name
    const column = options.column !== undefined ? options.column : toSnakeCase(String(propertyKey))
    const generated = options.generated !== undefined ? options.generated : true
    const comment = options.comment !== undefined ? options.comment : ''

    context.addInitializer(function (this: unknown): void {
      const klass = (this as Record<string | symbol, unknown>).constructor
      const value = (this as Record<string | symbol, unknown>)[propertyKey]
      if (value !== undefined && typeof value !== 'string') {
        const message = `Invalid PgKey field "${String(propertyKey)}" on ${klass.name || 'anonymous'}: key value must be a string, but got type "${typeof value}" (value: ${JSON.stringify(value)}).`
        logger.error(message)
        throw new Error(message)
      }
      assertValidIdentifier(column, 'column', `key ${String(propertyKey)} on ${klass.name || 'anonymous'}`)
      const map = ensureKeysMetadata(klass as object)
      map.set(propertyKey, { propertyKey, column, generated, comment })
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
    const column = options.column !== undefined ? options.column : toSnakeCase(String(propertyKey))
    const comment = options.comment !== undefined ? options.comment : ''
    const columnType = resolveColumnType(options.columnType, `column ${String(propertyKey)}`)

    context.addInitializer(function (this: unknown): void {
      const klass = (this as Record<string | symbol, unknown>).constructor
      assertValidIdentifier(column, 'column', `column ${String(propertyKey)} on ${klass.name || 'anonymous'}`)
      const map = ensureColumnsMetadata(klass as object)
      map.set(propertyKey, { propertyKey, column, comment, columnType })
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
    ensureEntityMetadata(target, options, value.name)
    // pre-initialise the key / column maps so field decorators can use them
    ensureKeysMetadata(target)
    ensureColumnsMetadata(target)
    // self-register so the class can be resolved later
    ENTITY_REGISTRY.set(value, options)
  }
}

// ---------------------------------------------------------------------------
// Public helper: retrieve fully-assembled entity metadata at runtime
// ---------------------------------------------------------------------------

/**
 * Ensure the key / column metadata of an entity is populated.
 *
 * Field decorators (@PgKey / @PgColumn) register their metadata via
 * `addInitializer`, which only runs when an instance is constructed. To let
 * consumers query metadata without manually calling `new`, this constructs
 * the entity once (cached) to fire those initializers, then assembles and
 * caches the fully-resolved metadata.
 */
function finalizePgEntity(ctor: object): void {
  const holder = ctor as Record<symbol, unknown>
  if (holder[FINALIZED]) return

  try {
    new (ctor as new () => unknown)()
  }
  catch (err) {
    const message = `Failed to finalize entity "${(ctor as { name?: string }).name}": ${err instanceof Error ? err.message : String(err)}. Entity classes must have a no-argument constructor so their field metadata can be collected.`
    logger.error(message)
    throw new Error(message)
  }

  holder[FINALIZED] = true
}

export function getPgEntityMetadata<T extends object>(ctor: T): PgEntityMetadata | undefined {
  const entityMeta = getEntityMetadata(ctor)
  if (!entityMeta) return undefined

  const holder = ctor as Record<symbol, unknown>
  if (holder[RESOLVED_METADATA]) {
    return holder[RESOLVED_METADATA] as PgEntityMetadata
  }

  finalizePgEntity(ctor)

  const resolved: PgEntityMetadata = {
    ...entityMeta,
    keys: [...(getKeysMetadata(ctor)?.values() ?? [])],
    columns: [...(getColumnsMetadata(ctor)?.values() ?? [])],
  }
  holder[RESOLVED_METADATA] = resolved
  return resolved
}

/**
 * Finalise and return metadata for every entity contained in the given
 * imported modules. Each module's exported values are inspected; exported
 * classes registered via @PgEntity are finalised so their field metadata is
 * collected. Returns fully-assembled `PgEntityMetadata` for all known entities.
 */
export function resolvePgEntities(modules: Record<string, unknown>[] = []): PgEntityMetadata[] {
  logger.info('Resolving @PgEntity metadata from imported modules...')
  let resolved = 0
  for (const mod of modules) {
    for (const exported of Object.values(mod)) {
      if (typeof exported === 'function' && ENTITY_REGISTRY.has(exported as Function)) {
        finalizePgEntity(exported as Function)
        resolved++
      }
    }
  }
  logger.info(`Resolved ${resolved} @PgEntity class(es) across ${modules.length} module(s)`)
  return getAllPgEntityMetadata()
}

/**
 * Return metadata for every registered entity, finalising each as needed.
 * This is the primary "query all entities" entry point and does not require
 * the consumer to construct any entity instance.
 */
export function getAllPgEntityMetadata(): PgEntityMetadata[] {
  const metas: PgEntityMetadata[] = []
  for (const ctor of ENTITY_REGISTRY.keys()) {
    const meta = getPgEntityMetadata(ctor)
    if (meta) metas.push(meta)
  }
  return metas
}
