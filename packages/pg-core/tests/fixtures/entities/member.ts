import { PgEntity, PgKey, PgColumn } from '../../../src'

@PgEntity({ table: 'members', schema: 'public' })
export class Member {
  @PgKey({ generated: true })
  id!: string

  @PgColumn({ columnType: 'TEXT' })
  name!: string

  @PgColumn({ columnType: 'DATE' })
  bornAt!: Date
}
