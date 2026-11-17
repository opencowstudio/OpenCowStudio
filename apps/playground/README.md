# @opencowstudio/playground

Nuxt app used for local development and debugging of
[`opencowstudio`](../../README.md).

## Getting started

```bash
# from the repo root
pnpm install
pnpm playground:dev
```

## API routes

The playground exposes an in-memory todo resource (stored in
`server/utils/todos.ts`) through a controller, so the module wiring can be
exercised end to end:

| Request | Handler |
|---------|---------|
| `GET /api/ctrl/todos` | `server/apis/todo-controller.ts` → `TodoController.todos` |
| `POST /api/ctrl/todos` | `server/apis/todo-controller.ts` → `TodoController.todos` |
| `GET /api/ctrl/todos/:id` | `server/apis/todo-controller.ts` → `TodoController.show` |

```bash
curl http://localhost:3000/api/ctrl/todos
curl -X POST http://localhost:3000/api/ctrl/todos -H 'content-type: application/json' -d '{"title":"from a controller"}'
```

Behaviour to observe:

- Routes come from `@ApiRoute({ path })` and are relative to the module's
  `prefix`; the source tree only groups controller files.
- A controller route answers **both `GET` and `POST`**, so the verbs share one
  handler and are distinguished by `context.method`.
- A controller handler is a plain class method receiving an `ApiRequestContext`
  (`params`, `query`, `headers`, `body`, `method`, `event`); the class is
  instantiated once at startup, so instance state is shared across requests.
- A controller is framework-agnostic by default, so an unknown id answers 204 (a
  `null` result is an empty response) instead of 404, and an invalid create
  payload surfaces as 500. Pass `context.event` to the HTTP layer when a
  controller needs a specific status code.
- **Only `GET` and `POST` are dispatched** to controller routes. Other verbs
  fall through to the rest of Nitro/Nuxt untouched — `PUT /api/ctrl/todos`
  renders the Nuxt page here.
- **Registration**: the controller file must sit under the module's `dir`
  (default `server/apis`) and is registered through the generated manifest and
  bootstrap plugin.
