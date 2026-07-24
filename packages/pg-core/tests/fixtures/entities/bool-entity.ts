import { PgEntity, PgKey, PgColumn } from '../../../src'

// BooleanLike options supplied as string literals; resolvePgEntityRaw must
// coerce them to real booleans.
@PgEntity({ createTableAuto: 'false', addColumnAuto: '0', createIndexAuto: 'true' })
export class BoolEntity {
  @PgKey({ generated: 'false' }) id!: string
  @PgColumn({ columnType: 'TEXT' }) name!: string
}
