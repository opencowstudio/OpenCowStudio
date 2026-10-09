import { PgEntity, PgKey, PgColumn } from '@opencowstudio/pg-core'

@PgEntity({
  schema: 'opencow',
  indexes: [{ columns: ['account'], unique: true }],
})
export class UserAccount {
  @PgKey()
  id!: string

  @PgColumn({ columnType: 'TEXT' })
  userId!: string

  @PgColumn({ columnType: 'TEXT' })
  loginType!: string

  @PgColumn({ columnType: 'TEXT' })
  account!: string

  @PgColumn({ columnType: 'TEXT' })
  password!: string

  @PgColumn({ columnType: 'DATE' })
  createdAt!: Date

  @PgColumn({ columnType: 'BIGINT' })
  createdAtTs!: number

  @PgColumn({ columnType: 'DATE' })
  updatedAt!: Date

  @PgColumn({ columnType: 'BIGINT' })
  updatedAtTs!: number
}
