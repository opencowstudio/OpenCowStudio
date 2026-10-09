import { PgEntity, PgKey, PgColumn } from '../../../src'

// Boolean options supplied explicitly; parsePgEntity must read each one.
@PgEntity({ createTableAuto: false, addColumnAuto: false, createIndexAuto: true })
export class BoolEntity {
  @PgKey({ generated: false }) id!: string
  @PgColumn({ columnType: 'TEXT' }) name!: string
}
