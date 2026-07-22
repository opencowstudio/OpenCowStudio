import { PgEntity, PgKey, PgColumn } from '@opencowstudio/pg-core'

@PgEntity({ table: 'users' })
export class User {
  @PgKey() id!: string
  @PgColumn({ columnType: 'TEXT' }) name!: string
}
