import { PgEntity, PgKey, PgColumn, PgIndex } from '../../../src/pg'

@PgEntity({
  table: 'users',
  schema: 'public',
  comment: 'Application users',
  createTableAuto: true,
  addColumnAuto: true,
  createIndexAuto: true,
})
@PgIndex({ columns: ['email'], unique: true })
export class User {
  @PgKey({ generated: false })
  id!: string

  @PgColumn({ comment: 'Login email', columnType: 'TEXT' })
  email!: string

  @PgColumn({ comment: 'Display name', columnType: 'TEXT' })
  displayName!: string

  @PgColumn({ columnType: 'DATE' })
  createdAt!: Date
}
