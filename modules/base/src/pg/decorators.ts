import type {
  PgColumnMetadata,
  PgColumnOptions,
  PgEntityMetadata,
  PgEntityOptions,
  PgKeyMetadata,
  PgKeyOptions,
} from './types.ts'

// ---------------------------------------------------------------------------
// Symbol keys used to store metadata on the class constructor
// ---------------------------------------------------------------------------

const ENTITY_METADATA = Symbol('pg:entity')
const KEY_METADATA = Symbol('pg:key')
const COLUMN_METADATA = Symbol('pg:column')

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
function ensureEntityMetadata(target: object, opts: PgEntityOptions): PgEntityMetadata {
  const holder = target as EntityMetadataHolder
  if (!holder[ENTITY_METADATA]) {
    holder[ENTITY_METADATA] = {
      dbName: opts.dbName ?? '',
      schema: opts.schema ?? '',
      table: opts.table ?? '',
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
) => void | ((initialValue: undefined) => V) {
  return function (value: undefined, context: ClassFieldDecoratorContext): void {
    const propertyKey = context.name
    const column = options.column !== undefined ? options.column : String(propertyKey)
    const generated = options.generated !== undefined ? options.generated : true
    const comment = options.comment !== undefined ? options.comment : ''

    context.addInitializer(function (this: unknown): void {
      const klass = (this as Record<string | symbol, unknown>).constructor
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
) => void | ((initialValue: undefined) => V) {
  return function (value: undefined, context: ClassFieldDecoratorContext): void {
    const propertyKey = context.name
    const column = options.column !== undefined ? options.column : String(propertyKey)
    const defaultValue = options.defaultValue !== undefined ? options.defaultValue : ''
    const comment = options.comment !== undefined ? options.comment : ''

    context.addInitializer(function (this: unknown): void {
      const klass = (this as Record<string | symbol, unknown>).constructor
      const map = ensureColumnsMetadata(klass as object)
      map.set(propertyKey, { propertyKey, column, defaultValue, comment })
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
    ensureEntityMetadata(target, options)
    // pre-initialise the key / column maps so field decorators can use them
    ensureKeysMetadata(target)
    ensureColumnsMetadata(target)
  }
}

// ---------------------------------------------------------------------------
// Public helper: retrieve fully-assembled entity metadata at runtime
// ---------------------------------------------------------------------------

export function getPgEntityMetadata<T extends object>(ctor: T): PgEntityMetadata | undefined {
  const entityMeta = getEntityMetadata(ctor)
  if (!entityMeta) return undefined

  return {
    ...entityMeta,
    keys: [...(getKeysMetadata(ctor)?.values() ?? [])],
    columns: [...(getColumnsMetadata(ctor)?.values() ?? [])],
  }
}
