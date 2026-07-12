// ---------------------------------------------------------------------------
// PostgreSQL decorator — barrel exports
// ---------------------------------------------------------------------------

export { PgEntity, PgKey, PgColumn, getPgEntityMetadata, getAllPgEntityMetadata, scanPgEntities } from './decorators'
export type {
  PgEntityOptions,
  PgKeyOptions,
  PgColumnOptions,
  PgColumnType,
  PgIndexOptions,
  PgEntityMetadata,
  PgKeyMetadata,
  PgColumnMetadata,
} from './types.ts'
