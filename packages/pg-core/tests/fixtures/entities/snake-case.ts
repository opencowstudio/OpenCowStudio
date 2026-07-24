import { PgEntity, PgKey, PgColumn } from '../../../src'

@PgEntity()
export class SnakeCase {
  @PgKey()
  userId!: string

  @PgColumn({ columnType: 'TEXT' })
  firstName!: string

  @PgColumn({ columnType: 'TEXT' })
  lastName!: string

  @PgColumn({ columnType: 'BIGINT' })
  userID!: number

  @PgColumn({ columnType: 'BIGINT' })
  httpStatusCode!: number

  @PgColumn({ columnType: 'TEXT' })
  displayName!: string
}
