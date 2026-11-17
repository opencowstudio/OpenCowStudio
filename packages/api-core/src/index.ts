// @opencowstudio/api-core — framework-agnostic HTTP API core.
//
// Public runtime entry: re-exports the shared contract (`shared/`), the runtime
// implementation (`runtime/`) and the decorator markers
// (`builder/decorators.ts`). That one file is the ONLY thing it may reach inside
// `builder/` — never `builder/parser.ts`, which is build-time only and pulls in
// the TypeScript compiler API.
//
// Layering — dependencies flow one way only: `builder/ -> shared/ <- runtime/`.
//   * shared/  : the cross-layer contract — metadata types + path helpers
//                (no `typescript`)
//   * builder/ : decorator markers + build-time parsing
//   * runtime/ : runtime implementation (controller instantiation + routing)
//
// This package has no dependency on Nuxt so it can be used in any Node.js
// environment.

// === builder — decorator markers ===========================================

// Controller decorators (static markers). Value-level only; free of `typescript`.
export { ApiController, ApiRoute } from './builder/decorators.ts'
export type { ApiControllerOptions, ApiRouteOptions } from './builder/decorators.ts'

// === shared — the metadata type contract ===================================

export { API_METHODS, DEFAULT_API_METHODS } from './shared/types.ts'
export type {
  ApiControllerMetadata,
  ApiError,
  ApiErrorResponse,
  ApiMethod,
  ApiRequestContext,
  ApiRouteMetadata,
} from './shared/types.ts'

// Route path normalisation, shared by the parser and the router.
export { joinApiPaths, normalizeApiPath } from './shared/path.ts'

// === runtime ===============================================================

// Route compilation, matching and dispatching, plus the controller registry
// built from the scanned metadata and the controller class map.
export { ApiRouter, compileApiPath } from './runtime/router.ts'
export type {
  ApiControllerClass,
  ApiControllerClassMap,
  ApiDispatchRequest,
  ApiDispatchResponse,
  ApiHandler,
  ApiRouteEntry,
  ApiRouteMatch,
} from './runtime/router.ts'

// JSON response helpers: the same envelope is used by `ApiRouter.dispatch` and
// by the HTTP adapters, so a custom adapter matches the built-in behaviour.
export {
  getApiError,
  isApiError,
  toApiError,
  toApiErrorBody,
  toApiResponse,
} from './runtime/response.ts'
