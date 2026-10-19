// Shared metadata builders for the runtime tests.
//
// The introspection and DDL tests need the same small shapes over and over — a
// minimal `EntityMetadata`, a declared `ColumnMetadata`, a catalog row — so
// they are built here once instead of being re-declared by every test file.

import type { PgColumnDefinition, ColumnMetadata, EntityMetadata } from '../../src'

/** Build the minimal entity metadata carrying `columns`. */
export function entityWith(columns: ColumnMetadata[]): EntityMetadata {
  return {
    className: 'Sample',
    modulePath: '/server/entities/sample.ts',
    dbName: 'default',
    schema: 'public',
    table: 'sample',
    comment: '',
    createTableAuto: true,
    addColumnAuto: true,
    createIndexAuto: true,
    indexes: [],
    key: { propertyKey: 'id', column: 'id', generated: false, comment: '', columnType: 'BIGINT' },
    columns,
  }
}

/** Build a declared column, overriding only the fields under test. */
export function column(overrides: Partial<ColumnMetadata>): ColumnMetadata {
  return { propertyKey: 'p', column: 'c', comment: '', columnType: 'TEXT', default: null, ...overrides }
}

/** Build a catalog row. */
export function definition(
  columnName: string,
  udtName: string,
  columnDefault: string | null,
): PgColumnDefinition {
  return { columnName, udtName, columnDefault }
}
