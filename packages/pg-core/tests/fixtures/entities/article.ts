import { PgEntity, PgKey, PgColumn } from '../../../src'

@PgEntity()
export class Article {
  @PgKey({ generated: false })
  slug!: string

  @PgColumn({ columnType: 'TEXT' })
  title!: string
}
