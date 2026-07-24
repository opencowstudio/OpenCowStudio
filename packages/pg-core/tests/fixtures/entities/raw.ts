import { PgEntity, PgKey, PgColumn } from '../../../src/pg'

// Decorator options supplied as raw literals (string booleans) so the static
// parser can verify it returns them verbatim, before resolvePgEntityRaw applies
// any normalisation.
@PgEntity({ dbName: 'my_db', schema: 'app', table: 'my_tbl', createTableAuto: 'false' })
export class RawEntity {
  @PgKey({ generated: 'false' })
  id!: string

  @PgColumn({ columnType: 'TEXT', comment: 'a comment' })
  name!: string
}
