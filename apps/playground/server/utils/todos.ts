// Shared in-memory store backing the controller API. It carries no HTTP
// concern, so `server/apis/**` controllers operate on plain data.

export interface Todo {
  id: string
  title: string
  done: boolean
  createdAt: string
}

/** Thrown when the payload of a create request is not usable. */
export class TodoInputError extends Error {}

const todos: Todo[] = [
  {
    id: '1',
    title: 'Try the controller route',
    done: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '2',
    title: 'Try the controller route',
    done: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
]

let nextId = todos.length + 1

/** Every todo, in creation order. */
export function listTodos(): Todo[] {
  return todos
}

/** One todo by id, or undefined when it does not exist. */
export function findTodo(id: string): Todo | undefined {
  return todos.find(todo => todo.id === id)
}

/**
 * Append one todo and return it.
 *
 * @throws {TodoInputError} When `input.title` is missing or blank.
 */
export function createTodo(input: unknown): Todo {
  const title = typeof input === 'object' && input !== null && 'title' in input
    ? (input as { title?: unknown }).title
    : undefined

  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new TodoInputError('A non-empty "title" is required.')
  }

  const todo: Todo = {
    id: String(nextId++),
    title: title.trim(),
    done: false,
    createdAt: new Date().toISOString(),
  }
  todos.push(todo)
  return todo
}
