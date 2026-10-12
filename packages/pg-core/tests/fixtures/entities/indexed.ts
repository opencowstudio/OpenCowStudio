import { PgEntity, PgKey, PgColumn } from '../../../src'

@PgEntity({ indexes: [{ columns: ['email'], unique: true }] })
export class Indexed {
  @PgKey() id!: string

  @PgColumn({ columnType: 'TEXT' })
  email!: string
}
