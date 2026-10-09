import { PgEntity, PgKey } from '../../../src'

// A non-boolean option value (cast past the type checker) must be rejected by
// parsePgEntity at runtime.
@PgEntity({ createTableAuto: 'maybe' as unknown as boolean })
export class BadBool {
  @PgKey() id!: string
}
