import { ApiController, ApiRoute, type ApiRequestContext } from '@opencowstudio/api-core'
import { createTodo, findTodo } from '../utils/todos'

// Controller style: one class groups the routes of a resource, and the method
// decorators declare the paths. The class is scanned at build time and
// instantiated once by the module's bootstrap plugin.
//
// Route paths are relative to the module's mount prefix (`/api`), so
// `/ctrl/todos` is served at `/api/ctrl/todos`.
@ApiController({ description: 'Todo resource, wired through a controller' })
export class TodoController {
  // A controller route always answers POST, so the payload travels in `body`.
  @ApiRoute({ path: '/ctrl/todos', description: 'Create a todo' })
  async todos({ body }: ApiRequestContext): Promise<unknown> {
    // No h3 helper is involved: an invalid payload surfaces as a 500. Throw
    // `{ code, message }` when you need a specific status code.
    return createTodo(body)
  }

  @ApiRoute({ path: '/ctrl/todos/:id', description: 'Read one todo' })
  show({ params }: ApiRequestContext): unknown {
    // Path parameters are captured from the `:id` segment and URL-decoded.
    // There is no thrown error here, so a missing todo answers `null` (a JSON
    // `null` body) rather than 404.
    return findTodo(params.id!) ?? null
  }
}
