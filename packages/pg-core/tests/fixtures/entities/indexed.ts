import { PgEntity, PgKey, PgIndex } from '../../../src'

@PgEntity()
@PgIndex({ columns: ['email'], unique: true })
export class Indexed {
  @PgKey() id!: string
}
