/**
 * Source of a controller module written into a temporary Nuxt root by the
 * manifest tests. It is never imported: the parser reads it statically.
 */
export const controllerSource = `
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController({ description: 'User endpoints' })
export class UserController {
  @ApiRoute({ path: '/users/:id' })
  async show(): Promise<unknown> {
    return null
  }

  @ApiRoute({ path: '/users' })
  async create(): Promise<unknown> {
    return null
  }
}
`
