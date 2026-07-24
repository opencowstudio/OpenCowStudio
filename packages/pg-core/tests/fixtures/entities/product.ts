import { PgEntity, PgKey, PgColumn } from '../../../src'

@PgEntity()
export class Product {
  @PgKey({ generated: true })
  productId!: number

  @PgColumn({ columnType: 'TEXT' })
  name!: string

  @PgColumn({ columnType: 'DOUBLE' })
  price!: number
}
