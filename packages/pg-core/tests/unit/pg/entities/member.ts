import { PgEntity, PgKey, PgColumn } from '../../../../src/pg'

@PgEntity({ table: 'members', schema: 'public' })
export class Member {
  @PgKey({ generated: true })
  id!: string

  @PgColumn({ columnType: 'TEXT' })
  name!: string

  @PgColumn({ columnType: 'DATE' })
  bornAt!: Date
}
