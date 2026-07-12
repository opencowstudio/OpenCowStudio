import { PgEntity, PgKey, PgColumn } from '../../../../src/pg'

@PgEntity()
export class Article {
  @PgKey({ generated: false })
  slug!: string

  @PgColumn({ columnType: 'TEXT' })
  title!: string
}
