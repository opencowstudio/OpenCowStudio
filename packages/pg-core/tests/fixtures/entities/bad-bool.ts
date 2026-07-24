import { PgEntity, PgKey } from '../../../src'

// An unparseable BooleanLike string must be rejected by resolvePgEntityRaw.
@PgEntity({ createTableAuto: 'maybe' })
export class BadBool {
  @PgKey() id!: string
}
