import { describe, it, expect } from 'vitest'
import { useLogger } from '@nuxt/kit'
import {
  PgEntity,
  PgKey,
  PgColumn,
  getPgEntityMetadata,
  getAllPgEntityMetadata,
  scanPgEntities,
} from '../../../src/pg'

const logger = useLogger('test')

// Auto-import every entity file via Vite's glob (no per-file imports). Importing
// the modules executes the @PgEntity decorators so classes self-register.
const entityModules = import.meta.glob('./entities/*.ts', { eager: true })

// Trigger entity scanning / registration before running assertions, so the
// metadata is available without manually constructing each entity.
scanPgEntities(Object.values(entityModules) as Record<string, unknown>[])

// Flatten the exported entity classes into a single lookup by name.
const entities = Object.fromEntries(
  Object.values(entityModules).flatMap(mod =>
    Object.entries(mod as Record<string, unknown>),
  ),
) as Record<string, object>

const User = entities.User!
const Product = entities.Product!
const SnakeCase = entities.SnakeCase!
const Member = entities.Member!
const Article = entities.Article!

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Pg decorators — definition & parsing', () => {
  it('should parse User entity metadata', () => {
    const meta = getPgEntityMetadata(User)
    expect(meta).toBeDefined()
    // eslint-disable-next-line no-console
    logger.info('Parsed User entity metadata:', JSON.stringify(meta, null, 2))

    expect(meta!.table).toBe('users')
    expect(meta!.schema).toBe('public')
    expect(meta!.comment).toBe('Application users')
    expect(meta!.createTableAuto).toBe(true)
    expect(meta!.indexes).toEqual([{ columns: ['email'], unique: true }])

    expect(meta!.keys).toHaveLength(1)
    expect(meta!.keys[0]).toMatchObject({
      propertyKey: 'id',
      column: 'id',
      generated: false,
      comment: '',
    })

    expect(meta!.columns).toHaveLength(3)
    expect(meta!.columns).toContainEqual({
      propertyKey: 'email',
      column: 'email',
      comment: 'Login email',
      columnType: 'TEXT',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'createdAt',
      column: 'created_at',
      comment: '',
      columnType: 'DATE',
    })
  })

  it('should derive defaults when options are omitted (Product entity)', () => {
    const meta = getPgEntityMetadata(Product)
    expect(meta).toBeDefined()
    // eslint-disable-next-line no-console
    logger.info('Parsed Product entity metadata:', JSON.stringify(meta, null, 2))

    // table defaults to snake_case of the class name (derived by the decorator)
    expect(meta!.table).toBe('product')
    expect(meta!.createTableAuto).toBe(true)

    expect(meta!.keys[0]).toMatchObject({
      propertyKey: 'productId',
      column: 'product_id',
      generated: true,
      comment: '',
    })

    expect(meta!.columns).toContainEqual({
      propertyKey: 'name',
      column: 'name',
      comment: '',
      columnType: 'TEXT',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'price',
      column: 'price',
      comment: '',
      columnType: 'DOUBLE',
    })
  })

  it('should default schema to "public" and table to snake_case class name when omitted', () => {
    const meta = getPgEntityMetadata(Product)
    expect(meta).toBeDefined()

    // schema defaults to 'public' when not provided
    expect(meta!.schema).toBe('public')
    // table defaults to snake_case of the class name when not provided
    expect(meta!.table).toBe('product')

    // snake_case of a multi-word class name
    const snakeMeta = getPgEntityMetadata(SnakeCase)
    expect(snakeMeta!.table).toBe('snake_case')
  })

  it('should keep provided schema and table when explicitly set', () => {
    const meta = getPgEntityMetadata(User)
    expect(meta!.schema).toBe('public')
    expect(meta!.table).toBe('users')
  })

  it('should derive snake_case column from field name when column option is omitted', () => {
    const meta = getPgEntityMetadata(SnakeCase)
    expect(meta).toBeDefined()

    expect(meta!.keys[0]).toMatchObject({
      propertyKey: 'userId',
      column: 'user_id',
    })

    expect(meta!.columns).toContainEqual({
      propertyKey: 'firstName',
      column: 'first_name',
      comment: '',
      columnType: 'TEXT',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'lastName',
      column: 'last_name',
      comment: '',
      columnType: 'TEXT',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'userID',
      column: 'user_id',
      comment: '',
      columnType: 'BIGINT',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'httpStatusCode',
      column: 'http_status_code',
      comment: '',
      columnType: 'BIGINT',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'displayName',
      column: 'display_name',
      comment: '',
      columnType: 'TEXT',
    })
  })
})

describe('Pg decorators — name validation', () => {
  const VALID_RE = /^[a-zA-Z0-9_]+$/

  it('should throw when dbName contains invalid characters', () => {
    expect(() => {
      @PgEntity({ dbName: 'bad-db' })
      class BadDb {}

      new BadDb()
    }).toThrow(/Invalid dbName/)
  })

  it('should throw when schema contains invalid characters', () => {
    expect(() => {
      @PgEntity({ schema: 'bad schema' })
      class BadSchema {}

      new BadSchema()
    }).toThrow(/Invalid schema/)
  })

  it('should throw when table contains invalid characters', () => {
    expect(() => {
      @PgEntity({ table: 'bad-table!' })
      class BadTable {}

      new BadTable()
    }).toThrow(/Invalid table/)
  })

  it('should accept valid dbName, schema and table without throwing', () => {
    expect(() => {
      @PgEntity({ dbName: 'my_db_1', schema: 'app_schema', table: 'my_table' })
      class ValidEntity {}

      new ValidEntity()
    }).not.toThrow()
  })

  it('should throw when a PgColumn column name contains invalid characters', () => {
    expect(() => {
      class BadColumn {
        @PgColumn({ column: 'bad-column', columnType: 'TEXT' })
        name!: string
      }

      new BadColumn()
    }).toThrow(/Invalid column/)
  })

  it('should throw when a PgKey column name contains invalid characters', () => {
    expect(() => {
      class BadKey {
        @PgKey({ column: 'bad key' })
        id!: string
      }

      new BadKey()
    }).toThrow(/Invalid column/)
  })

  it('should throw when an index column name contains invalid characters', () => {
    expect(() => {
      @PgEntity({ indexes: [{ columns: ['bad-column'], unique: true }] })
      class BadIndex {}

      new BadIndex()
    }).toThrow(/Invalid index column/)
  })

  it('should throw when an index references an invalid column name per the identifier regex', () => {
    expect(() => {
      @PgEntity({ indexes: [{ columns: ['valid_col', 'not valid'] }] })
      class BadIndexCol {}

      new BadIndexCol()
    }).toThrow(/Invalid index column/)
  })

  it('should accept a valid index column name without throwing', () => {
    expect(() => {
      @PgEntity({ indexes: [{ columns: ['email'], unique: true }] })
      class ValidIndex {}

      new ValidIndex()
    }).not.toThrow()
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
      @PgColumn({ columnType: 'JSON_OBJECT' })
      data!: { a: number }

      @PgColumn({ columnType: 'JSON_ARRAY' })
      tags!: Array<string>
    }

    new Typed()
    const meta = getPgEntityMetadata(Typed)
    expect(meta!.columns).toContainEqual({
      propertyKey: 'data',
      column: 'data',
      comment: '',
      columnType: 'JSON_OBJECT',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'tags',
      column: 'tags',
      comment: '',
      columnType: 'JSON_ARRAY',
    })
  })

  it('should throw when columnType is not declared', () => {
    expect(() => {
      class MissingType {
        @PgColumn()
        name!: string
      }

      new MissingType()
    }).toThrow(/columnType/)
  })

  it('should throw when columnType is an invalid value', () => {
    expect(() => {
      class BadType {
        @PgColumn({ columnType: 'INVALID' as never })
        name!: string
      }

      new BadType()
    }).toThrow(/columnType/)
  })
})

describe('Pg entity scanning & lookup', () => {
  it('should build metadata for an entity without manually constructing it', () => {
    const meta = getPgEntityMetadata(Member)
    expect(meta).toBeDefined()
    expect(meta!.table).toBe('members')
    expect(meta!.schema).toBe('public')
    expect(meta!.keys).toHaveLength(1)
    expect(meta!.keys[0]).toMatchObject({ propertyKey: 'id', column: 'id' })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'name',
      column: 'name',
      comment: '',
      columnType: 'TEXT',
    })
  })

  it('should derive table from class name when not provided', () => {
    const meta = getPgEntityMetadata(Article)
    expect(meta!.table).toBe('article')
  })

  it('should return metadata for all scanned modules via scanPgEntities', () => {
    const metas = scanPgEntities(Object.values(entityModules) as Record<string, unknown>[])
    const tables = metas.map(m => m.table).sort()
    expect(tables).toContain('members')
    expect(tables).toContain('article')
  })

  it('should return metadata for all registered entities via getAllPgEntityMetadata', () => {
    const metas = getAllPgEntityMetadata()
    const tables = metas.map(m => m.table).sort()
    expect(tables).toContain('members')
    expect(tables).toContain('article')
  })

  it('should return undefined for a non-entity class', () => {
    class Plain {}
    expect(getPgEntityMetadata(Plain)).toBeUndefined()
  })

  it('should make getPgEntityMetadata idempotent (cached, no repeated construction)', () => {
    const first = getPgEntityMetadata(Member)
    const second = getPgEntityMetadata(Member)
    expect(second).toBe(first)
  })
})
