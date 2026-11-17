import { ApiController, ApiRoute } from '../../../src/index.ts'

// Route paths may be declared through a local constant: the parser resolves
// top-level identifiers of the declaring module.
export const USER_DETAIL_PATH = '/users/:id'

@ApiController({ description: 'User endpoints' })
export class UserController {
  @ApiRoute({ path: USER_DETAIL_PATH, description: 'Read a user' })
  async show(): Promise<unknown> {
    return null
  }

  @ApiRoute({ path: '/users', description: 'List users' })
  async list(): Promise<unknown[]> {
    return []
  }

  @ApiRoute({ path: '/users/touch' })
  async touch(): Promise<null> {
    return null
  }

  async notARoute(): Promise<void> {}
}

@ApiController()
export class HealthController {
  @ApiRoute({ path: '/health' })
  async check(): Promise<null> {
    return null
  }
}
