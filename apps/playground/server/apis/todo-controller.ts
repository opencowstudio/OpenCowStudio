import { ApiController, ApiRoute, type ApiRequest } from '@opencowstudio/api-core'
import type { CreateTodoInput, TodoOutput } from './schemas/todo'
import { createTodo, findTodo } from '../utils/todos'

// Controller style: one class groups the routes of a resource, and the method
// decorators declare the paths. The class is scanned at build time and
// instantiated once by the module's bootstrap plugin.
//
// Route paths are relative to the module's mount prefix (`/api`), so
// `/ctrl/todos` is served at `/api/ctrl/todos`.
@ApiController({ description: 'Todo resource, wired through a controller' })
export class TodoController {
  // A controller route always answers POST. A parameter whose type is not
  // `ApiRequest` asks for the request JSON shaped into that type: the body is
  // validated by the schema of that name and the parsed value is injected, so an
  // invalid payload is answered with `400` before the handler runs. Any number
  // of input parameters may be declared; each one receives its own parsed copy
  // of the body.
  @ApiRoute({ path: '/ctrl/todos', description: 'Create a todo' })
  async todos(input: CreateTodoInput): Promise<TodoOutput> {
    return createTodo(input)
  }

  @ApiRoute({ path: '/ctrl/todos/:id', description: 'Read one todo' })
  show({ params }: ApiRequest): TodoOutput | null {
    // Path parameters are captured from the `:id` segment and URL-decoded.
    // There is no thrown error here, so a missing todo answers `null` (a JSON
    // `null` body) rather than 404.
    return findTodo(params.id!) ?? null
  }
}
