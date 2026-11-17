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
- A controller handler is a plain class method that receives an
  `ApiRequestContext` (`params`, `query`, `headers`, `body`, `method`, `event`)
  when it declares that parameter, and is invoked without arguments when it
  declares none; the body is only parsed when the context is injected. The class
  is instantiated once at startup, so instance state is shared across requests.
- Requests and responses are JSON and every response carries the `200` status:
  a result is sent as-is, an empty result answers `{}`, and a failure answers
  `{"error":{"code":...,"message":"..."}}`. The playground controller is
  framework-agnostic by default, so an unknown id returns `null` (a JSON `null`
  body) instead of 404, and an invalid create payload surfaces as a JSON error.
  Throw `{ code, message }` to identify the failure.
- A request whose path + method matches no `ApiRoute` answers
  `{"error":{"code":404,"message":"Not Found"}}` — `PUT /api/ctrl/todos`
  included, since routes only answer `GET` and `POST`.
- Any origin may call the API (`Access-Control-Allow-Origin: *`), and `OPTIONS`
  preflights are answered by the same handler.
- **Registration**: the controller file must sit under the module's `dir`
  (default `server/apis`); one catch-all Nitro handler serves the prefix and the
  router matches each request at runtime.
