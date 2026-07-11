import { describe, it, expect } from 'vitest'
import {
  PgEntity,
  PgKey,
  PgColumn,
  getPgEntityMetadata,
} from '../../../src/pg'

// ---------------------------------------------------------------------------
// Entities under test
// ---------------------------------------------------------------------------

@PgEntity({
  table: 'users',
  schema: 'public',
  comment: 'Application users',
  createTableAuto: true,
  addColumnAuto: true,
  createIndexAuto: true,
  indexes: [{ columns: ['email'], unique: true }],
})
class User {
  @PgKey({ generated: false })
  id!: string

  @PgColumn({ comment: 'Login email' })
  email!: string

  @PgColumn({ comment: 'Display name' })
  displayName!: string

  @PgColumn()
  createdAt!: Date
}

@PgEntity()
class Product {
  @PgKey({ generated: true })
  productId!: number

  @PgColumn()
  name!: string

  @PgColumn({ defaultValue: '0' })
  price!: number
}

@PgEntity()
class SnakeCase {
  @PgKey()
  userId!: string

  @PgColumn()
  firstName!: string

  @PgColumn()
  lastName!: string

  @PgColumn()
  userID!: number

  @PgColumn()
  httpStatusCode!: number

  @PgColumn()
  displayName!: string
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Pg decorators — definition & parsing', () => {
  it('should parse User entity metadata', () => {
    // Field decorators register via addInitializer, which runs on construction.
    new User()
    const meta = getPgEntityMetadata(User)
    expect(meta).toBeDefined()
    // eslint-disable-next-line no-console
    console.log('Parsed User entity metadata:', JSON.stringify(meta, null, 2))

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
      defaultValue: '',
      comment: 'Login email',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'createdAt',
      column: 'created_at',
      defaultValue: '',
      comment: '',
    })
  })

  it('should derive defaults when options are omitted (Product entity)', () => {
    new Product()
    const meta = getPgEntityMetadata(Product)
    expect(meta).toBeDefined()
    // eslint-disable-next-line no-console
    console.log('Parsed Product entity metadata:', JSON.stringify(meta, null, 2))

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
      defaultValue: '',
      comment: '',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'price',
      column: 'price',
      defaultValue: '0',
      comment: '',
    })
  })

  it('should default schema to "public" and table to snake_case class name when omitted', () => {
    new Product()
    const meta = getPgEntityMetadata(Product)
    expect(meta).toBeDefined()

    // schema defaults to 'public' when not provided
    expect(meta!.schema).toBe('public')
    // table defaults to snake_case of the class name when not provided
    expect(meta!.table).toBe('product')

    // snake_case of a multi-word class name
    new SnakeCase()
    const snakeMeta = getPgEntityMetadata(SnakeCase)
    expect(snakeMeta!.table).toBe('snake_case')
  })

  it('should keep provided schema and table when explicitly set', () => {
    new User()
    const meta = getPgEntityMetadata(User)
    expect(meta!.schema).toBe('public')
    expect(meta!.table).toBe('users')
  })

  it('should return undefined for a non-entity class', () => {
    class Plain {}
    expect(getPgEntityMetadata(Plain)).toBeUndefined()
  })

  it('should derive snake_case column from field name when column option is omitted', () => {
    new SnakeCase()
    const meta = getPgEntityMetadata(SnakeCase)
    expect(meta).toBeDefined()

    expect(meta!.keys[0]).toMatchObject({
      propertyKey: 'userId',
      column: 'user_id',
    })

    expect(meta!.columns).toContainEqual({
      propertyKey: 'firstName',
      column: 'first_name',
      defaultValue: '',
      comment: '',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'lastName',
      column: 'last_name',
      defaultValue: '',
      comment: '',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'userID',
      column: 'user_id',
      defaultValue: '',
      comment: '',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'httpStatusCode',
      column: 'http_status_code',
      defaultValue: '',
      comment: '',
    })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'displayName',
      column: 'display_name',
      defaultValue: '',
      comment: '',
    })
  })
})
