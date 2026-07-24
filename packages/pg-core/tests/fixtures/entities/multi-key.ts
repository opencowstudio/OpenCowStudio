import { PgEntity, PgKey } from '../../../src/pg'

// An entity must declare exactly one @PgKey; two must be rejected.
@PgEntity()
export class MultiKey {
  @PgKey() id!: string
  @PgKey() secondId!: string
}
