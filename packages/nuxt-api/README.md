# @opencowstudio/nuxt-api

Nuxt module that integrates [`@opencowstudio/api-core`](../api-core) into a
Nuxt/Nitro application.

## What it does

- At build time it scans the controller source files (`server/apis/**/*.ts` by
  default, configurable through the `dir` option), resolves every discovered
  `@ApiController` class into an `ApiControllerMetadata` (paths normalised,
  duplicate routes rejected), logs the
  total number of controllers and each resolved controller, and bakes the typed
  collection into a **server-only** manifest (`api.manifest.ts`).
- The manifest also carries the controller class map (`apiControllersTypeMap`)
  and the normalised mount prefix, so the route table and the HTTP entry cannot
  disagree on either.
- At runtime a Nitro plugin imports the manifest directly, builds the
  `ApiRouter` from it — instantiating every controller and binding each route
  handler — and injects the router service (`runtime/utils/router.ts`):
  `useApiRouter()` is auto-imported in Nitro server code.
- Every declared `path + method` is registered as its own Nitro route, so it
  appears in Nitro's route table (devtools, route rules) like a file-based
  `server/api` route. All routes point at the same handler module
  (`runtime/server/api.ts`), which hands the request to `ApiRouter.dispatch`:
  the HTTP entry and the unit tests run **exactly the same pipeline**
  (`executeApiRoute`) — matching, context building, argument injection,
  response/error normalisation. Permission checks, request validation and
  response validation belong in that pipeline and therefore apply to both
  entries.
- Only the declared `path + method` pairs are registered, so any other request
  — an undeclared path or verb, the `OPTIONS` preflight — is answered by Nitro
  instead of the module.
- `ApiRouter.dispatch` answers a JSON `404` `ApiError` for a miss, and every
  response it produces keeps the `200` status — failures travel in the body
  (`{ error: { code, message } }`), never in the status line.
- Responses of the registered routes carry `Access-Control-Allow-Origin: *`.

Because the parsing happens at build time, a misplaced `@ApiRoute` (on a
property or a static method) or a duplicated method + path pair fails the build
with a detailed error, including the offending file, line and column — or, with
a single invalid controller, is skipped with a warning so the rest of the build
continues.

## Usage

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    ['@opencowstudio/nuxt-api', {
      // Controllers are scanned from this directory (relative to the Nuxt root).
      dir: 'server/apis',
      // Prefix prepended to every controller route when it is registered.
      prefix: '/api',
    }],
  ],
})
```

```ts
// server/apis/user.ts
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController()
export class UserController {
  @ApiRoute({ path: '/users/:id' })
  async show({ params }: ApiRequestContext): Promise<unknown> {
    return { id: params.id }
  }
}
```

A `POST /api/users/42` request is then answered by `UserController.show` with
`params = { id: '42' }`. Every route answers `POST`; a request
whose path + method matches no route (including other verbs) answers a `404`
`ApiError` instead of falling through.

Controller routes are JSON endpoints, in and out. The request body is parsed as
JSON for the methods that carry one (`POST`, `PUT`, `PATCH`, `DELETE`) and is
handed to the handler as an object; a request without a body yields `{}`. A body
that is not a JSON object — an array, a primitive, `null` — is rejected with
`{"error":{"code":400,"message":"Bad Request"}}`. The answer is always a JSON
document, always with the `200` status:

| Outcome | Response |
|---------|----------|
| returned nothing | `{}` |
| returned a string | `{"text":"..."}` |
| returned anything else | that value |
| body is not a JSON object | `{"error":{"code":400,"message":"Bad Request"}}` |
| no matching route | `{"error":{"code":404,"message":"Not Found"}}` |
| threw `{ code, message }` | `{"error":{"code":404,"message":"..."}}` |
| threw anything else | `{"error":{"code":500,"message":"..."}}` |

The `code` is informational: it identifies the failure for the client, while the
HTTP status stays `200`.

```ts
@ApiRoute({ path: '/ctrl/echo' })
echo({ body }: ApiRequestContext): unknown {
  return body
}

@ApiRoute({ path: '/ctrl/missing' })
missing(): unknown {
  throw { code: 404, message: 'Not found' }
}
```

Handler parameters are injected by their declared type, in declaration order.
`ApiRequestContext` is the only injectable type today, so a handler either
declares it or takes no parameter at all — and nothing is read from the request
otherwise (the body is only parsed when the context is injected):

```ts
@ApiController()
export class TodoController {
  // No parameter: invoked without arguments.
  @ApiRoute({ path: '/ctrl/health' })
  health(): { ok: true } {
    return { ok: true }
  }

  // Declared parameter: receives the request context.
  @ApiRoute({ path: '/ctrl/todos' })
  todos({ body }: ApiRequestContext): unknown {
    return createTodo(body)
  }
}
```

The metadata records one entry per parameter (`name` + `source`), so further
injectable types can be added later without reshaping it. A parameter whose type
is not injectable, or a rest parameter, fails the build.

### Router service

`useApiRouter()` is auto-imported in `server/` code and exposes the injected
router. It returns the same instance the bootstrap plugin registered, so an
entity controller can be reached from any handler:

```ts
// server/api/users.get.ts
export default defineEventHandler(() => {
  const controller = useApiRouter().getController<UserController>('UserController')
  return controller.list()
})
```

The service is injected by the module's bootstrap plugin, so it throws when the
plugin has not run yet.

## Module options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable or disable the module. |
| `dir` | `'server/apis'` | Directory scanned for controller classes, relative to the Nuxt root. |
| `prefix` | `'/api'` | Prefix prepended to every controller route when it is registered on the Nitro router. |
