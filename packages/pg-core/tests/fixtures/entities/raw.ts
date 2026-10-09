import { PgEntity, PgKey, PgColumn } from '../../../src'

// Decorator options supplied as literals, so the parser can verify it reads
// them from source and resolves them (defaults, snake_case).
@PgEntity({ dbName: 'my_db', schema: 'app', table: 'my_tbl', createTableAuto: false })
export class RawEntity {
  @PgKey({ generated: false })
  id!: string

  @PgColumn({ columnType: 'TEXT', comment: 'a comment' })
  name!: string
}
