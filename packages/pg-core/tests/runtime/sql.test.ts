import { describe, it, expect } from 'vitest'
import { DEFAULT_SCHEMA, FilterBuilder, PgSqlTemplate, SortBuilder } from '../../src'
import type { PgColumnMetadata, PgEntityMetadata, PgIndexMetadata } from '../../src'

// Guards the invariant documented on `runtime/sql.ts`: every statement is
// written with its own trailing semicolon, and a multi-statement script joins
// those statements with a newline. The class is a pure string catalogue, so
// these tests need neither `pg` nor a database.

const SCHEMA = 'public'
const TABLE = 'users'

function column(overrides: Partial<PgColumnMetadata> = {}): PgColumnMetadata {
  return {
    propertyKey: 'name',
    column: 'name',
    comment: '',
    columnType: 'TEXT',
    default: '',
    ...overrides,
  }
}

const PLAIN_INDEX: PgIndexMetadata = { columns: ['name'], unique: false, gin: false }
const UNIQUE_INDEX: PgIndexMetadata = { columns: ['name'], unique: true, gin: false }
const GIN_INDEX: PgIndexMetadata = { columns: ['name'], unique: false, gin: true }

const ENTITY: PgEntityMetadata = {
  className: 'User',
  modulePath: '/server/entities/user.ts',
  dbName: 'default',
  schema: SCHEMA,
  table: TABLE,
  comment: 'users table',
  createTableAuto: true,
  addColumnAuto: true,
  createIndexAuto: true,
  indexes: [PLAIN_INDEX, UNIQUE_INDEX, GIN_INDEX],
  key: {
    propertyKey: 'id',
    column: 'id',
    generated: false,
    comment: 'primary key',
    columnType: 'BIGINT',
  },
  columns: [
    column(),
    column({ propertyKey: 'age', column: 'age', columnType: 'INT', default: 0, comment: 'age in years' }),
  ],
}

describe('PgSqlTemplate', () => {
  it('should terminate every statement with a semicolon', () => {
    const statements: Array<[string, string]> = [
      ['CREATE_EXTENSION_PG_TRGM', PgSqlTemplate.CREATE_EXTENSION_PG_TRGM],
      ['createSchema', PgSqlTemplate.createSchema(SCHEMA)],
      ['createTable', PgSqlTemplate.createTable(ENTITY)],
      ['createIndex', PgSqlTemplate.createIndex(SCHEMA, TABLE, PLAIN_INDEX)],
      ['addColumn', PgSqlTemplate.addColumn(SCHEMA, TABLE, column())],
      ['addColumn (commented)', PgSqlTemplate.addColumn(SCHEMA, TABLE, column({ comment: 'name' }))],
      ['alterColumnType', PgSqlTemplate.alterColumnType(SCHEMA, TABLE, column())],
      ['alterColumnDefault (set)', PgSqlTemplate.alterColumnDefault(SCHEMA, TABLE, column({ default: 1 }))],
      ['alterColumnDefault (drop)', PgSqlTemplate.alterColumnDefault(SCHEMA, TABLE, column({ default: null }))],
      ['CREATE_SQL_EXECUTION_SCRIPT_TABLE', PgSqlTemplate.CREATE_SQL_EXECUTION_SCRIPT_TABLE],
      ['INSERT_SQL_EXECUTION_SCRIPT', PgSqlTemplate.INSERT_SQL_EXECUTION_SCRIPT],
      ['COLUMN_DEFINITIONS', PgSqlTemplate.COLUMN_DEFINITIONS],
      ['INDEX_DEFINITIONS', PgSqlTemplate.INDEX_DEFINITIONS],
    ]

    for (const [name, statement] of statements) {
      expect(statement.endsWith(';'), `${name} should end with ";"`).toBe(true)
      // The terminator is the last character: no trailing newline or blank line.
      expect(statement, `${name} should not have a trailing newline`).toBe(statement.trimEnd())
    }
  })

  it('should join the statements of a script with a newline', () => {
    const script = PgSqlTemplate.INITIALIZATION_SCRIPT

    expect(script).toBe(
      `${PgSqlTemplate.CREATE_EXTENSION_PG_TRGM}\n${PgSqlTemplate.CREATE_SQL_EXECUTION_SCRIPT_TABLE}`,
    )
    // Every statement already carries its terminator, so the separator is a
    // bare newline and no statement is left empty.
    expect(script).not.toContain(';;')
    expect(script).not.toMatch(/;\s*\n\s*;/)
  })

  it('should join the statements of createTable with a newline', () => {
    const script = PgSqlTemplate.createTable(ENTITY)

    expect(script.startsWith('CREATE TABLE IF NOT EXISTS "public"."users" (')).toBe(true)
    expect(script).toContain(');\nCOMMENT ON TABLE "public"."users" IS \'users table\';')
    expect(script).toContain('COMMENT ON COLUMN "public"."users"."id" IS \'primary key\';')
    expect(script).toContain('COMMENT ON COLUMN "public"."users"."age" IS \'age in years\';')
    expect(script).toContain('CREATE UNIQUE INDEX')
    expect(script).toContain('USING gin')
    expect(script.endsWith(';')).toBe(true)
    expect(script).not.toContain(';;')
  })

  it('should collect the insert values in parameter order', () => {
    const row = { id: 'u1', name: 'Ada', age: 36 }

    // Key first, then the declared columns — the order `insertRow` binds.
    expect(PgSqlTemplate.insertRowValues(ENTITY, row)).toEqual(['u1', 'Ada', 36])
  })

  it('should bind null for a column the row does not carry', () => {
    expect(PgSqlTemplate.insertRowValues(ENTITY, { id: 'u1' })).toEqual(['u1', null, null])
  })

  it('should collect the update values in parameter order', () => {
    const row = { id: 'u1', name: 'Ada', age: 36 }

    // Declared columns first, then the key — the order `updateRow` binds.
    expect(PgSqlTemplate.updateRowValues(ENTITY, row)).toEqual(['Ada', 36, 'u1'])
    expect(PgSqlTemplate.updateRowValues(ENTITY, { id: 'u1' })).toEqual([null, null, 'u1'])
  })

  it('should default createSchema to the default schema', () => {
    expect(PgSqlTemplate.createSchema()).toBe(PgSqlTemplate.createSchema(DEFAULT_SCHEMA))
    expect(PgSqlTemplate.createSchema()).toBe('CREATE SCHEMA IF NOT EXISTS "public";')
  })

  it('should omit the DEFAULT clause when the column has no default', () => {
    expect(PgSqlTemplate.addColumn(SCHEMA, TABLE, column({ columnType: 'BOOLEAN', default: null }))).toBe(
      'ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "name" BOOLEAN;',
    )
  })

  it('should emit the ALTER COLUMN statements for a column', () => {
    const col = column({ columnType: 'DOUBLE', default: 0 })

    expect(PgSqlTemplate.alterColumnType(SCHEMA, TABLE, col)).toBe(
      'ALTER TABLE "public"."users" ALTER COLUMN "name" TYPE DOUBLE PRECISION;',
    )
    expect(PgSqlTemplate.alterColumnDefault(SCHEMA, TABLE, col)).toBe(
      'ALTER TABLE "public"."users" ALTER COLUMN "name" SET DEFAULT 0;',
    )
    expect(PgSqlTemplate.alterColumnDefault(SCHEMA, TABLE, column({ default: undefined }))).toBe(
      'ALTER TABLE "public"."users" ALTER COLUMN "name" DROP DEFAULT;',
    )
  })

  it('should always close the paged statement with LIMIT and OFFSET', () => {
    const { sql, values } = PgSqlTemplate.selectPage(ENTITY, { limit: 20, offset: 40 })

    expect(sql).toBe(
      [
        'SELECT',
        '  "id",',
        '  "name",',
        '  "age"',
        'FROM "public"."users"',
        'LIMIT $1 OFFSET $2;',
      ].join('\n'),
    )
    expect(values).toEqual([20, 40])
  })

  it('should build the count statement on its own', () => {
    expect(PgSqlTemplate.selectCount(ENTITY)).toEqual({
      sql: 'SELECT COUNT(*) FROM "public"."users";',
      values: [],
    })

    const filter = FilterBuilder.equals('name', 'Ada').build()
    expect(PgSqlTemplate.selectCount(ENTITY, filter)).toEqual({
      sql: 'SELECT COUNT(*) FROM "public"."users"\nWHERE "name" = $1;',
      values: ['Ada'],
    })

    // A filter that renders no predicate leaves only the bare count.
    expect(PgSqlTemplate.selectCount(ENTITY, FilterBuilder.bool().build())).toEqual({
      sql: 'SELECT COUNT(*) FROM "public"."users";',
      values: [],
    })
  })

  it('should resolve a filter name through the entity property map', () => {
    const entity: PgEntityMetadata = {
      ...ENTITY,
      columns: [...ENTITY.columns, column({ propertyKey: 'createdAt', column: 'created_at' })],
    }

    // A property key is resolved to the column it is stored in.
    expect(PgSqlTemplate.selectCount(entity, FilterBuilder.match('createdAt', '2026').build())).toEqual({
      sql: `SELECT COUNT(*) FROM "public"."users"\nWHERE "created_at" LIKE $1 ESCAPE '\\';`,
      values: ['%2026%'],
    })

    // A name the map does not hold is used as written.
    expect(PgSqlTemplate.selectCount(entity, FilterBuilder.equals('nick_name', 'ada').build()).sql).toContain(
      '"nick_name" = $1',
    )
  })

  it('should render filter conditions and the sort condition of a page', () => {
    const filter = FilterBuilder.bool()
      .must(FilterBuilder.equals('name', 'Ada').build())
      .must(FilterBuilder.range('age').gte(18).lt(65).build())
      .mustNot(FilterBuilder.anyOf('name', ['Bob', 'Eve']).build())
      .should(FilterBuilder.match('name', 'A%').build())
      .build()
    const sort = SortBuilder.multiColumn().desc('age').asc('name').build()

    const { sql, values } = PgSqlTemplate.selectPage(ENTITY, {
      filter,
      sort,
      limit: 10,
      offset: 0,
    })

    expect(sql).toContain(
      `WHERE ("name" = $1 AND ("age" >= $2 AND "age" < $3) `
        + `AND NOT ("name" = ANY($4)) AND ("name" LIKE $5 ESCAPE '\\'))`,
    )
    expect(sql).toContain('ORDER BY "age" DESC, "name" ASC')
    expect(sql.endsWith('LIMIT $6 OFFSET $7;')).toBe(true)
    expect(values).toEqual(['Ada', 18, 65, ['Bob', 'Eve'], '%A\\%%', 10, 0])
  })

  it('should bind the in filter as a single array parameter', () => {
    const filter = FilterBuilder.anyOf('name', ['Bob', 'Eve']).build()
    const { sql, values } = PgSqlTemplate.selectPage(ENTITY, { filter, limit: 10, offset: 0 })

    expect(sql).toContain('WHERE "name" = ANY($1)')
    expect(values).toEqual([['Bob', 'Eve'], 10, 0])

    // An empty set binds an empty array, which matches nothing on the server.
    const empty = FilterBuilder.anyOf('name').build()
    const page = PgSqlTemplate.selectPage(ENTITY, { filter: empty, limit: 10, offset: 0 })
    expect(page.sql).toContain('WHERE "name" = ANY($1)')
    expect(page.values).toEqual([[], 10, 0])
  })

  it('should escape the LIKE metacharacters of a match filter', () => {
    const filter = FilterBuilder.match('name', '50%_off\\').build()
    const { sql, values } = PgSqlTemplate.selectPage(ENTITY, { filter, limit: 10, offset: 0 })

    expect(sql).toContain(`WHERE "name" LIKE $1 ESCAPE '\\'`)
    // `%`, `_` and `\` are escaped, then the whole value is wrapped in `%…%`.
    expect(values).toEqual(['%50\\%\\_off\\\\%', 10, 0])
  })

  it('should omit a filter that contributes no predicate', () => {
    const { sql } = PgSqlTemplate.selectPage(ENTITY, {
      filter: FilterBuilder.bool().build(),
      limit: 10,
      offset: 0,
    })

    expect(sql).not.toContain('WHERE')
    expect(sql).not.toContain('ORDER BY')
    expect(sql.endsWith('LIMIT $1 OFFSET $2;')).toBe(true)
  })

  it('should quote identifiers and string literals', () => {
    expect(PgSqlTemplate.createSchema('tenant_a')).toBe('CREATE SCHEMA IF NOT EXISTS "tenant_a";')
    expect(PgSqlTemplate.addColumn('s', 't', column({ default: "o'brien" }))).toBe(
      `ALTER TABLE "s"."t" ADD COLUMN IF NOT EXISTS "name" TEXT DEFAULT 'o''brien';`,
    )
  })
})
