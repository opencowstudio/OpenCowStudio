import { ApiController, ApiRoute, type ApiRequestContext } from '@opencowstudio/api-core'
import { createTodo, findTodo, listTodos } from '../utils/todos'

// Controller style: one class groups the routes of a resource, and the method
// decorators declare the paths. The class is scanned at build time and
// instantiated once by the module's bootstrap plugin.
//
// Route paths are relative to the module's mount prefix (`/api`), so
// `/ctrl/todos` is served at `/api/ctrl/todos`.
@ApiController({ description: 'Todo resource, wired through a controller' })
export class TodoController {
  // A controller route always answers both POST and GET, so the two verbs share
  // one handler and are distinguished by `context.method`.
  @ApiRoute({ path: '/ctrl/todos', description: 'List todos on GET, create one on POST' })
  async todos({ method, body }: ApiRequestContext): Promise<unknown> {
    if (method === 'POST') {
      // No h3 helper is involved: an invalid payload surfaces as a 500. Pass
      // `context.event` to the HTTP layer if you need a specific status code.
      return createTodo(body)
    }

    return listTodos()
  }

  @ApiRoute({ path: '/ctrl/todos/:id', description: 'Read one todo' })
  show({ params }: ApiRequestContext): unknown {
    // Path parameters are captured from the `:id` segment and URL-decoded.
    // There is no `createError` here, so a missing todo answers 204 (a null
    // result is an empty response) rather than 404.
    return findTodo(params.id!) ?? null
  }
}
