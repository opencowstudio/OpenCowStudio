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
  and the normalised mount prefix, so the route table and the generated Nitro
  handlers cannot disagree on either.
- At runtime a Nitro plugin imports the manifest directly, builds the
  `ApiRouter` from it — instantiating every controller and binding each route
  handler — and injects the router service (`runtime/utils/router.ts`):
  `useApiRouter()` is auto-imported in Nitro server code.
- Every declared path + method pair is also registered as a real Nitro route
  handler, so Nitro itself performs the matching (path params, method,
  precedence) and the generated module dispatches to the controller method,
  passing an `ApiRequestContext` (`params`, `query`, `headers`, `body`, `event`)
  only when the method declares that parameter. Controller routes therefore
  behave like file-based ones and never shadow them.

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

A `GET /api/users/42` request is then answered by `UserController.show` with
`params = { id: '42' }`. Every route answers both `GET` and `POST`; other
methods are left untouched.

Controller routes are JSON endpoints, in and out: the request body is parsed as
JSON for the methods that carry one (`POST`, `PUT`, `PATCH`, `DELETE`), and the
answer is always a JSON document:

| Handler outcome | Response |
|-----------------|----------|
| returned nothing | `{}` |
| returned a string | `{"text":"..."}` |
| returned anything else | that value |
| threw `{ code, message }` | `{"error":{"code":404,"message":"..."}}`, HTTP status `code` |
| threw anything else | `{"error":{"code":500,"message":"..."}}` |

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

Handler parameters follow the method signature, so a handler only receives what
it declares:

```ts
@ApiController()
export class HealthController {
  // No parameter: invoked without arguments.
  @ApiRoute({ path: '/ctrl/health' })
  health(): { ok: true } {
    return { ok: true }
  }

  // Declared parameter: receives the request context.
  @ApiRoute({ path: '/ctrl/echo' })
  echo({ body }: ApiRequestContext): unknown {
    return body
  }
}
```

A handler declaring anything but a single `ApiRequestContext` parameter fails
the build.

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
