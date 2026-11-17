# @opencowstudio/api-core

Framework-agnostic HTTP API core for [`opencowstudio`](../../README.md).

This package contains everything that does **not** depend on Nuxt: the API
decorators, their static parser and the runtime router.

## Layout

The source is split by lifecycle stage, and dependencies flow one way only:
`builder/ -> shared/ <- runtime/`.

- `shared/` — the cross-layer contract shared by the builder and the runtime:
  the metadata types (`types.ts`) and the route path helpers (`path.ts`); no
  `typescript`.
- `builder/` — the decorator markers + their option types
  (`builder/decorators.ts`) and the build-time parser
  (`builder/parser.ts`, the only place that imports the TypeScript compiler
  API); exposed as `@opencowstudio/api-core/builder`.
- `runtime/` — the runtime router: it instantiates the scanned controllers,
  binds their route handlers and compiles the path patterns.

The runtime entry (`@opencowstudio/api-core`) re-exports `shared/`, `runtime/`
and exactly one file inside `builder/` (`decorators.ts`, which carries no
`typescript`). It never reaches `builder/parser.ts`, so the compiler API stays
out of the runtime bundle. These rules are enforced by
`tests/architecture.test.ts`.

## What it provides

- `@ApiController` / `@ApiRoute` decorators (static markers) and their option
  types (`ApiControllerOptions`, `ApiRouteOptions`) in
  `builder/decorators.ts`.
- The metadata contract in `shared/types.ts`: `ApiControllerMetadata`,
  `ApiRouteMetadata`, `ApiMethod` (plus `API_METHODS`) and the
  `ApiRequestContext` handed to every handler.
- A build-time metadata pipeline (`builder/parser.ts`, exported from
  `@opencowstudio/api-core/builder`): `parseApiController` / `parseApiControllers`
  statically read the decorator *source* via the TypeScript compiler API and
  return fully-resolved `ApiControllerMetadata` — defaults applied, paths
  normalised, every route bound to `POST`, misplaced decorators
  and duplicate route paths rejected.
- The runtime router (`runtime/router.ts`):
  - `compileApiPath` turns `/users/:id` into a matcher plus its parameter names.
  - `ApiRouter` instantiates every controller, binds each route handler to its
    instance, matches requests (static segments win over parameters) and
    dispatches them, passing the `ApiRequestContext` only to handlers that
    declare it.

## Usage

```ts
import { ApiController, ApiRoute, type ApiRequestContext } from '@opencowstudio/api-core'

@ApiController()
export class UserController {
  @ApiRoute({ path: '/users/:id' })
  async show({ params }: ApiRequestContext): Promise<unknown> {
    return { id: params.id }
  }
}
```

A controller has no base path of its own: every `@ApiRoute` declares the full
path (relative to the mount prefix), and the class name identifies the
controller. `@ApiController` only accepts an optional `description`.

A route declares neither a method nor a name: `path` is required, every route
answers `POST`, and its name is `${className}.${handler}`.

Handler parameters are injected by their declared type, in declaration order.
`ApiRequestContext` is the only injectable type today, so a method either
declares it or takes no parameter at all:

```ts
@ApiRoute({ path: '/users/:id' })
show(context: ApiRequestContext): unknown {
  return { id: context.params.id }
}
```

The metadata records one entry per parameter (`name` + `source`), so further
injectable types can be added later without reshaping it: add a source to
`ApiParameterSource`, a mapping in the parser and a case in `toApiArguments`.

A parameter whose type is not injectable, or a rest parameter, fails the build,
so a handler never silently receives `undefined`.

At runtime the router is built from the metadata produced by the parser and a
map of the controller classes keyed by class name:

```ts
import { ApiRouter } from '@opencowstudio/api-core'

const router = new ApiRouter(controllersMetadata, controllerClasses)
const result = await router.dispatch({ method: 'GET', path: '/users/42' })
// { id: '42' }
```

The answer *is* the JSON value — there is no `body` wrapper. A miss is a `404`
like any other failure, so there is no separate "not matched" outcome:

| Outcome | Response |
|---------|----------|
| returned nothing (`undefined`) | `{}` |
| returned a string | `{ "text": "..." }` |
| returned anything else | that value |
| no route matched | `{ "error": { "code": 404, "message": "Not Found" } }` |
| threw `{ code, message }` | `{ "error": { "code": 404, "message": "User not found" } }` |
| threw anything else | `{ "error": { "code": 500, "message": "..." } }` |

A handler reports a failure by throwing an `ApiError`-shaped object; `code`
identifies the failure in the body, it is not the HTTP status — adapters answer
`200` and let the body carry the error:

```ts
@ApiRoute({ path: '/users/:id' })
show({ params }: ApiRequestContext): unknown {
  const user = findUser(params.id)
  if (!user) throw { code: 404, message: 'User not found' }
  return user
}
```

`dispatch` and the HTTP adapters share one pipeline (`executeApiRoute`), so
permission checks, request validation and response validation added there apply
to both entries. `getApiError(response)` reads the error a response carries,
while `toApiResponse`, `isApiError`, `toApiError` and `toApiErrorBody` are
exported so a custom adapter can reuse the exact same conversion.

For Nuxt integration, use [`@opencowstudio/nuxt-api`](../nuxt-api) instead of
wiring this package up manually.
