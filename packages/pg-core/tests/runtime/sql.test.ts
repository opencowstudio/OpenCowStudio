import { describe, it, expect } from 'vitest'
import { DEFAULT_SCHEMA, PgSqlTemplate } from '../../src'
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

  it('should quote identifiers and literals', () => {
    expect(PgSqlTemplate.createSchema('we"ird')).toBe('CREATE SCHEMA IF NOT EXISTS "we""ird";')
    expect(PgSqlTemplate.addColumn('s', 't', column({ default: "o'brien" }))).toBe(
      `ALTER TABLE "s"."t" ADD COLUMN IF NOT EXISTS "name" TEXT DEFAULT 'o''brien';`,
    )
  })
})
