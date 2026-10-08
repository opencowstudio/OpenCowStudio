import { PgEntity, PgKey, PgColumn } from '../../../src'

// No boolean options supplied; parsePgEntity must fill the defaults.
@PgEntity()
export class DefaultBool {
  @PgKey() id!: string
  @PgColumn({ columnType: 'TEXT' }) name!: string
}
