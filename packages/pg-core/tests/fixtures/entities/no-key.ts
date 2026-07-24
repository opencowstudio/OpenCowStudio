import { PgEntity, PgColumn } from '../../../src'

// An entity must declare exactly one @PgKey; none must be rejected.
@PgEntity()
export class NoKey {
  @PgColumn({ columnType: 'TEXT' }) name!: string
}
