import { PgEntity, PgKey, PgColumn } from '@opencowstudio/pg-core'

// Login method values stored in the `login_type` column. They are top-level
// constants so the decorator below can reference one for its default: the
// builder parser only evaluates identifiers declared in the same file.
const LOGIN_TYPE_PASSWORD = 'PASSWORD'
const LOGIN_TYPE_WECHAT = 'WECHAT'

/** Login method of a user account: account/password or WeChat. */
export type LoginType = typeof LOGIN_TYPE_PASSWORD | typeof LOGIN_TYPE_WECHAT

@PgEntity({
  schema: 'opencow',
  indexes: [{ columns: ['account'], unique: true }],
})
export class UserAccount {
  @PgKey()
  id!: string

  @PgColumn({ columnType: 'TEXT' })
  userId!: string

  @PgColumn({ columnType: 'TEXT', default: LOGIN_TYPE_PASSWORD })
  loginType!: LoginType

  @PgColumn({ columnType: 'TEXT' })
  account!: string

  @PgColumn({ columnType: 'TEXT' })
  password!: string

  @PgColumn({ columnType: 'DATE' })
  createdAt!: Date

  @PgColumn({ columnType: 'DATE' })
  updatedAt!: Date
}
