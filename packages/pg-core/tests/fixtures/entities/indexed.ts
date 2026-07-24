import { PgEntity, PgKey, PgIndex } from '../../../src/pg'

@PgEntity()
@PgIndex({ columns: ['email'], unique: true })
export class Indexed {
  @PgKey() id!: string
}
