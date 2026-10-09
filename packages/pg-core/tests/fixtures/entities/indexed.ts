import { PgEntity, PgKey } from '../../../src'

@PgEntity({ indexes: [{ columns: ['email'], unique: true }] })
export class Indexed {
  @PgKey() id!: string
}
