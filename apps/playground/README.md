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
| `POST /api/ctrl/todos` | `server/apis/todo-controller.ts` → `TodoController.todos` |
| `POST /api/ctrl/todos/:id` | `server/apis/todo-controller.ts` → `TodoController.show` |

```bash
curl -X POST http://localhost:3000/api/ctrl/todos -H 'content-type: application/json' -d '{"title":"from a controller"}'
curl -X POST http://localhost:3000/api/ctrl/todos/1
```

Behaviour to observe:

- Routes come from `@ApiRoute({ path })` and are relative to the module's
  `prefix`; the source tree only groups controller files.
- A controller route answers **`POST` only**, so the payload travels in
  `context.body` as a **parsed JSON object** (`{}` when the request carried no
  body). A body that is not a JSON object — an array, a primitive, `null` — is
  rejected with a `400` `Bad Request` error before the handler runs.
- A controller handler is a plain class method that receives an
  `ApiRequestContext` (`path`, `params`, `query`, `headers`, `body`, `event`)
  when it declares that parameter, and is invoked without arguments when it
  declares none; the body is only read when the context is injected. The class
  is instantiated once at startup, so instance state is shared across requests.
- Requests and responses are JSON and every response carries the `200` status:
  a result is sent as-is, an empty result answers `{}`, and a failure answers
  `{"error":{"code":...,"message":"..."}}`. The playground controller is
  framework-agnostic by default, so an unknown id returns `null` (a JSON `null`
  body) instead of 404, and an invalid create payload surfaces as a JSON error.
  Throw `{ code, message }` to identify the failure.
- Only the registered `path + method` pairs reach a controller, so `GET
  /api/ctrl/todos` (routes only answer `POST`) is answered by Nitro instead.
- Responses carry `Access-Control-Allow-Origin: *`; the `OPTIONS` preflight is
  not registered, so it does not reach the handler either.
- **Registration**: the controller file must sit under the module's `dir`
  (default `server/apis`). Every declared `path + method` is registered as its
  own Nitro route (so it shows up in the server route list), and the router
  matches each request at runtime.
