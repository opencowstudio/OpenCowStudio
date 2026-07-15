import { PgEntity, PgKey, PgColumn } from '@opencowstudio/pg-core'

@PgEntity({ table: 'users', comment: 'Playground users' })
export class User {
  @PgKey({ column: 'id', generated: false })
  id: string = ''

  @PgColumn({ columnType: 'TEXT', comment: 'Login email' })
  email: string = ''

  @PgColumn({ columnType: 'DATE' })
  createdAt: string = ''
}
