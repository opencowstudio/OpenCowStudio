/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { consola } from 'consola'
import {
  PgEntity,
  PgKey,
  PgColumn,
  resolvePgEntities,
  buildPgEntityRaw,
  resolvePgEntityRaw,
  type PgEntityMetadata,
  type PgEntityRaw,
} from '../../src/pg'

const logger = consola.withTag('test')

// Import every entity module eagerly so the @PgEntity decorators execute and
// the classes self-register at module-evaluation time.
const entityModules = import.meta.glob('./entities/*.ts', { eager: true })

// Resolve entity metadata before running assertions, so the metadata is
// available without manually constructing each entity.
const allMetas = resolvePgEntities(Object.values(entityModules) as Record<string, unknown>[])
const metaByTable = new Map(allMetas.map(m => [m.table, m]))

function metaFor(table: string): PgEntityMetadata {
  const meta = metaByTable.get(table)
  if (!meta) throw new Error(`No resolved metadata for table "${table}"`)
  return meta
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Pg decorators — definition & parsing', () => {
  it('should parse User entity metadata', () => {
    const meta = metaFor('users')
    expect(meta).toBeDefined()
    logger.info('Parsed User entity metadata:', JSON.stringify(meta, null, 2))

    expect(meta.table).toBe('users')
    expect(meta.schema).toBe('public')
    expect(meta.comment).toBe('Application users')
    expect(meta.createTableAuto).toBe(true)
    expect(meta.indexes).toEqual([{ columns: ['email'], unique: true }])

    expect(meta.key).toMatchObject({
      propertyKey: 'id',
      column: 'id',
      generated: false,
      comment: '',
    })

    expect(meta.columns).toHaveLength(3)
    expect(meta.columns).toContainEqual({
      propertyKey: 'email',
      column: 'email',
      comment: 'Login email',
      columnType: 'TEXT',
    })
    expect(meta.columns).toContainEqual({
      propertyKey: 'createdAt',
      column: 'created_at',
      comment: '',
      columnType: 'DATE',
    })
  })

  it('should derive defaults when options are omitted (Product entity)', () => {
    const meta = metaFor('product')
    expect(meta).toBeDefined()
    logger.info('Parsed Product entity metadata:', JSON.stringify(meta, null, 2))

    // table defaults to snake_case of the class name (derived by the decorator)
    expect(meta.table).toBe('product')
    expect(meta.createTableAuto).toBe(true)

    expect(meta.key).toMatchObject({
      propertyKey: 'productId',
      column: 'product_id',
      generated: true,
      comment: '',
    })

    expect(meta.columns).toContainEqual({
      propertyKey: 'name',
      column: 'name',
      comment: '',
      columnType: 'TEXT',
    })
    expect(meta.columns).toContainEqual({
      propertyKey: 'price',
      column: 'price',
      comment: '',
      columnType: 'DOUBLE',
    })
  })

  it('should default schema to "public" and table to snake_case class name when omitted', () => {
    const meta = metaFor('product')
    expect(meta).toBeDefined()

    // schema defaults to 'public' when not provided
    expect(meta.schema).toBe('public')
    // table defaults to snake_case of the class name when not provided
    expect(meta.table).toBe('product')

    // snake_case of a multi-word class name
    const snakeMeta = metaFor('snake_case')
    expect(snakeMeta.table).toBe('snake_case')
  })

  it('should keep provided schema and table when explicitly set', () => {
    const meta = metaFor('users')
    expect(meta.schema).toBe('public')
    expect(meta.table).toBe('users')
  })

  it('should derive snake_case column from field name when column option is omitted', () => {
    const meta = metaFor('snake_case')
    expect(meta).toBeDefined()

    expect(meta.key).toMatchObject({
      propertyKey: 'userId',
      column: 'user_id',
    })

    expect(meta.columns).toContainEqual({
      propertyKey: 'firstName',
      column: 'first_name',
      comment: '',
      columnType: 'TEXT',
    })
    expect(meta.columns).toContainEqual({
      propertyKey: 'lastName',
      column: 'last_name',
      comment: '',
      columnType: 'TEXT',
    })
    expect(meta.columns).toContainEqual({
      propertyKey: 'userID',
      column: 'user_id',
      comment: '',
      columnType: 'BIGINT',
    })
    expect(meta.columns).toContainEqual({
      propertyKey: 'httpStatusCode',
      column: 'http_status_code',
      comment: '',
      columnType: 'BIGINT',
    })
    expect(meta.columns).toContainEqual({
      propertyKey: 'displayName',
      column: 'display_name',
      comment: '',
      columnType: 'TEXT',
    })
  })
})

describe('Pg decorators — name validation', () => {
  const VALID_RE = /^[a-zA-Z0-9_]+$/

  it('should throw when dbName contains invalid characters (at resolution time)', () => {
    @PgEntity({ dbName: 'bad-db' })
    class BadDb {
      @PgKey()
      id!: string
    }

    expect(() => resolvePgEntities([{ BadDb } as Record<string, unknown>])).toThrow(/Invalid dbName/)
  })

  it('should throw when schema contains invalid characters (at resolution time)', () => {
    @PgEntity({ schema: 'bad schema' })
    class BadSchema {
      @PgKey()
      id!: string
    }

    expect(() => resolvePgEntities([{ BadSchema } as Record<string, unknown>])).toThrow(/Invalid schema/)
  })

  it('should throw when table contains invalid characters (at resolution time)', () => {
    @PgEntity({ table: 'bad-table!' })
    class BadTable {
      @PgKey()
      id!: string
    }

    expect(() => resolvePgEntities([{ BadTable } as Record<string, unknown>])).toThrow(/Invalid table/)
  })

  it('should accept valid dbName, schema and table without throwing (at resolution time)', () => {
    @PgEntity({ dbName: 'my_db_1', schema: 'app_schema', table: 'my_table' })
    class ValidEntity {
      @PgKey()
      id!: string
    }

    expect(() => resolvePgEntities([{ ValidEntity } as Record<string, unknown>])).not.toThrow()
  })

  it('should throw when a PgColumn column name contains invalid characters (at resolution time)', () => {
    @PgEntity()
    class BadColumn {
      @PgKey()
      id!: string

      @PgColumn({ column: 'bad-column', columnType: 'TEXT' })
      name!: string
    }

    expect(() => resolvePgEntities([{ BadColumn } as Record<string, unknown>])).toThrow(/Invalid column/)
  })

  it('should throw when a PgKey column name contains invalid characters (at resolution time)', () => {
    @PgEntity()
    class BadKey {
      @PgKey({ column: 'bad key' })
      id!: string
    }

    expect(() => resolvePgEntities([{ BadKey } as Record<string, unknown>])).toThrow(/Invalid column/)
  })

  it('should throw when an index column name contains invalid characters (at resolution time)', () => {
    @PgEntity({ indexes: [{ columns: ['bad-column'], unique: true }] })
    class BadIndex {
      @PgKey()
      id!: string
    }

    expect(() => resolvePgEntities([{ BadIndex } as Record<string, unknown>])).toThrow(/Invalid index column/)
  })

  it('should throw when an index references an invalid column name per the identifier regex (at resolution time)', () => {
    @PgEntity({ indexes: [{ columns: ['valid_col', 'not valid'] }] })
    class BadIndexCol {
      @PgKey()
      id!: string
    }

    expect(() => resolvePgEntities([{ BadIndexCol } as Record<string, unknown>])).toThrow(/Invalid index column/)
  })

  it('should accept a valid index column name without throwing (at resolution time)', () => {
    @PgEntity({ indexes: [{ columns: ['email'], unique: true }] })
    class ValidIndex {
      @PgKey()
      id!: string
    }

    expect(() => resolvePgEntities([{ ValidIndex } as Record<string, unknown>])).not.toThrow()
  })

  it('should ensure the identifier regex itself only matches [a-zA-Z0-9_]+', () => {
    expect(VALID_RE.test('abc_123')).toBe(true)
    expect(VALID_RE.test('abc-123')).toBe(false)
    expect(VALID_RE.test('abc 123')).toBe(false)
    expect(VALID_RE.test('abc!')).toBe(false)
  })
})

describe('Pg decorators — PgKey field type validation', () => {
  it('should throw when a PgKey field is initialised with a non-string value (number)', () => {
    expect(() => {
      class BadKeyNumber {
        @PgKey()
        id = 42
      }

      new BadKeyNumber()
    }).toThrow(/Invalid PgKey/)
  })

  it('should throw when a PgKey field is initialised with a non-string value (object)', () => {
    expect(() => {
      class BadKeyObject {
        @PgKey()
        id = { a: 1 }
      }

      new BadKeyObject()
    }).toThrow(/Invalid PgKey/)
  })

  it('should allow a PgKey field that is declared but not yet assigned (undefined)', () => {
    expect(() => {
      class KeyUndefined {
        @PgKey()
        id!: string
      }

      new KeyUndefined()
    }).not.toThrow()
  })

  it('should accept a PgKey field holding a string value without throwing', () => {
    expect(() => {
      class GoodKeyType {
        @PgKey()
        id = 'abc'
      }

      new GoodKeyType()
    }).not.toThrow()
  })
})

describe('Pg decorators — PgColumn columnType requirement', () => {
  it('should store the declared columnType in metadata', () => {
    @PgEntity()
    class Typed {
      @PgKey()
      id!: string

      @PgColumn({ columnType: 'JSON_OBJECT' })
      data!: { a: number }

      @PgColumn({ columnType: 'JSON_ARRAY' })
      tags!: Array<string>
    }

    const metas = resolvePgEntities([{ Typed } as Record<string, unknown>])
    const meta = metas.find(m => m.table === 'typed')!
    expect(meta.columns).toContainEqual({
      propertyKey: 'data',
      column: 'data',
      comment: '',
      columnType: 'JSON_OBJECT',
    })
    expect(meta.columns).toContainEqual({
      propertyKey: 'tags',
      column: 'tags',
      comment: '',
      columnType: 'JSON_ARRAY',
    })
  })

  it('should throw when columnType is not declared (at resolution time)', () => {
    @PgEntity()
    class MissingType {
      @PgKey()
      id!: string

      @PgColumn()
      name!: string
    }

    expect(() => resolvePgEntities([{ MissingType } as Record<string, unknown>])).toThrow(/columnType/)
  })

  it('should throw when columnType is an invalid value (at resolution time)', () => {
    @PgEntity()
    class BadType {
      @PgKey()
      id!: string

      @PgColumn({ columnType: 'INVALID' as never })
      name!: string
    }

    expect(() => resolvePgEntities([{ BadType } as Record<string, unknown>])).toThrow(/columnType/)
  })
})

describe('Pg entity resolution & lookup', () => {
  it('should build metadata for an entity without manually constructing it', () => {
    const meta = metaFor('members')
    expect(meta).toBeDefined()
    expect(meta.table).toBe('members')
    expect(meta.schema).toBe('public')
    expect(meta.key).toMatchObject({ propertyKey: 'id', column: 'id' })
    expect(meta.columns).toContainEqual({
      propertyKey: 'name',
      column: 'name',
      comment: '',
      columnType: 'TEXT',
    })
  })

  it('should derive table from class name when not provided', () => {
    const meta = metaFor('article')
    expect(meta.table).toBe('article')
  })

  it('should return metadata for all modules via resolvePgEntities', () => {
    const metas = resolvePgEntities(Object.values(entityModules) as Record<string, unknown>[])
    const tables = metas.map(m => m.table).sort()
    expect(tables).toContain('members')
    expect(tables).toContain('article')
  })

  it('should return no metadata for a non-entity class', () => {
    class Plain {}
    const metas = resolvePgEntities([{ Plain } as Record<string, unknown>])
    expect(metas).toHaveLength(0)
  })

  it('should re-parse metadata on every call (no caching)', () => {
    const first = resolvePgEntities(Object.values(entityModules) as Record<string, unknown>[])
    const second = resolvePgEntities(Object.values(entityModules) as Record<string, unknown>[])
    expect(second).not.toBe(first)
    expect(second.map(m => m.table).sort()).toEqual(first.map(m => m.table).sort())
  })
})

describe('Pg decorators — raw config & two-stage resolution', () => {
  // A helper that constructs the entity (firing field decorators) and then
  // reads the unmodified raw config via buildPgEntityRaw.
  function rawFor(ctor: Function): PgEntityRaw {
    new (ctor as new () => unknown)()
    const raw = buildPgEntityRaw(ctor)
    if (!raw) throw new Error(`No raw config for ${ctor.name}`)
    return raw
  }

  it('buildPgEntityRaw should return the decorator options verbatim (no defaults, no conversion)', () => {
    @PgEntity({ dbName: 'my_db', schema: 'app', table: 'my_tbl', createTableAuto: 'false' as never })
    class RawEntity {
      @PgKey({ generated: 'false' as never })
      id!: string

      @PgColumn({ columnType: 'TEXT', comment: 'a comment' })
      name!: string
    }

    const raw = rawFor(RawEntity)
    expect(raw.className).toBe('RawEntity')
    // string booleans are preserved exactly as supplied
    expect(raw.options.createTableAuto).toBe('false')
    expect(raw.options.dbName).toBe('my_db')
    expect(raw.options.schema).toBe('app')
    expect(raw.options.table).toBe('my_tbl')
    expect(raw.key).toMatchObject({ propertyKey: 'id', options: { generated: 'false' } })
    expect(raw.columns).toHaveLength(1)
    expect(raw.columns[0]).toMatchObject({
      propertyKey: 'name',
      options: { columnType: 'TEXT', comment: 'a comment' },
    })
  })

  it('resolvePgEntityRaw should normalise BooleanLike strings to real booleans', () => {
    @PgEntity({ createTableAuto: 'false' as never, addColumnAuto: '0' as never, createIndexAuto: 'true' as never })
    class BoolEntity {
      @PgKey({ generated: 'false' as never })
      id!: string

      @PgColumn({ columnType: 'TEXT' })
      name!: string
    }

    const raw = rawFor(BoolEntity)
    const meta = resolvePgEntityRaw(raw)
    expect(meta.createTableAuto).toBe(false)
    expect(meta.addColumnAuto).toBe(false)
    expect(meta.createIndexAuto).toBe(true)
    expect(meta.key!.generated).toBe(false)
  })

  it('resolvePgEntityRaw should apply defaults for omitted boolean options', () => {
    @PgEntity()
    class DefaultBool {
      @PgKey()
      id!: string

      @PgColumn({ columnType: 'TEXT' })
      name!: string
    }

    const raw = rawFor(DefaultBool)
    const meta = resolvePgEntityRaw(raw)
    expect(meta.createTableAuto).toBe(true)
    expect(meta.addColumnAuto).toBe(true)
    expect(meta.createIndexAuto).toBe(true)
    expect(meta.key!.generated).toBe(true)
  })

  it('resolvePgEntityRaw should normalise index.unique BooleanLike strings', () => {
    @PgEntity({ indexes: [{ columns: ['email'], unique: 'true' as never }] })
    class Indexed {
      @PgKey()
      id!: string
    }

    const raw = rawFor(Indexed)
    const meta = resolvePgEntityRaw(raw)
    expect(meta.indexes).toEqual([{ columns: ['email'], unique: true }])
  })

  it('resolvePgEntityRaw should throw on an unparseable BooleanLike string', () => {
    @PgEntity({ createTableAuto: 'maybe' as never })
    class BadBool {
      @PgKey()
      id!: string
    }

    const raw = rawFor(BadBool)
    expect(() => resolvePgEntityRaw(raw)).toThrow(/Invalid boolean value/)
  })

  it('buildPgEntityRaw should return undefined for a non-entity class', () => {
    class Plain {}
    expect(buildPgEntityRaw(Plain)).toBeUndefined()
  })

  it('should throw when more than one @PgKey is declared', () => {
    @PgEntity()
    class MultiKey {
      @PgKey()
      id!: string

      @PgKey()
      secondId!: string
    }

    expect(() => rawFor(MultiKey)).toThrow(/exactly one @PgKey/)
  })

  it('should throw when no @PgKey is declared', () => {
    @PgEntity()
    class NoKey {
      @PgColumn({ columnType: 'TEXT' })
      name!: string
    }

    expect(() => rawFor(NoKey)).toThrow(/exactly one @PgKey/)
  })
})
