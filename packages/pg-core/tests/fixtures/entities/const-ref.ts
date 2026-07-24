import { PgEntity, PgKey } from '../../../src'

const SCHEMA = 'tenant'

// A decorator argument may reference a locally-declared constant.
@PgEntity({ schema: SCHEMA })
export class ConstRef {
  @PgKey() id!: string
}
