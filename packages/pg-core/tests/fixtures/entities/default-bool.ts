import { PgEntity, PgKey, PgColumn } from '../../../src/pg'

// No boolean options supplied; resolvePgEntityRaw must fill the defaults.
@PgEntity()
export class DefaultBool {
  @PgKey() id!: string
  @PgColumn({ columnType: 'TEXT' }) name!: string
}
