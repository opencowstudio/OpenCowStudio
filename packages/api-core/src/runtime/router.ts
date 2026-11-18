import { consola } from 'consola'
import { joinApiPaths, normalizeApiPath } from '../shared/path.ts'
import type {
  ApiControllerMetadata,
  ApiRouteMetadata,
} from '../shared/types.ts'
import type { ApiPipelineRequest, ApiResponseBody } from './pipeline.ts'
import { apiNotFoundBody, executeApiRoute } from './pipeline.ts'

// Tagged logger so the core stays framework-agnostic (no Nuxt dep).
const logger = consola.withTag('api-router')

// ---------------------------------------------------------------------------
// Runtime router
//
// The parser yields `ApiControllerMetadata` at build time; at runtime the
// router instantiates every controller class, binds each declared route handler
// to its instance and compiles the composed path into a matcher. The result is
// the object the Nuxt module injects into server code.
//
// Route patterns use `:name` segments (`/users/:id/posts`). Every matched
// segment is URL-decoded into `ApiRouteMatch.params`.
// ---------------------------------------------------------------------------

/** A controller class: constructible without arguments. */
export type ApiControllerClass = new (...args: never[]) => object

/** The controller classes of a scan, keyed by their class name. */
export type ApiControllerClassMap = Record<string, ApiControllerClass>

/**
 * A bound route handler.
 *
 * The arguments are the request values its declared parameters select (see
 * {@link ApiRouteMetadata.parameters}), in declaration order; a handler
 * declaring no parameter is invoked without arguments.
 */
export type ApiHandler = (...args: unknown[]) => unknown

/** A compiled route of the router. */
export interface ApiRouteEntry {
  /** Metadata of the controller that owns the route. */
  controller: ApiControllerMetadata
  /** Metadata of the route itself. */
  route: ApiRouteMetadata
  /** Composed path pattern: controller base path + route path. */
  path: string
  /** Controller instance the handler is bound to. */
  instance: object
  /** Handler bound to {@link instance}. */
  handler: ApiHandler
  /** Names of the path parameters, in pattern order. */
  keys: string[]
  /** Compiled matcher of {@link path}. */
  pattern: RegExp
}

/** The result of matching a request against the router. */
export interface ApiRouteMatch {
  /** HTTP method of the request, upper-cased. */
  method: string
  /** Metadata of the matched controller. */
  controller: ApiControllerMetadata
  /** Metadata of the matched route. */
  route: ApiRouteMetadata
  /** Composed path of the matched route. */
  path: string
  /** Controller instance the handler is bound to. */
  instance: object
  /** Handler bound to {@link instance}. */
  handler: ApiHandler
  /** Path parameters captured from the request path. */
  params: Record<string, string>
}

/** The request handed to {@link ApiRouter.dispatch}. */
export type ApiDispatchRequest = ApiPipelineRequest

/**
 * The JSON object answered by {@link ApiRouter.dispatch}.
 *
 * The response *is* the payload — there is no `body` wrapper. It may carry an
 * `error` object (`{ error: { code, message } }`) when the request failed; see
 * {@link getApiError} to read it.
 */
export type ApiDispatchResponse = ApiResponseBody

/** Matches a `:name` path segment. */
const PARAM_SEGMENT_RE = /^:([A-Za-z_$][A-Za-z0-9_$]*)$/

/** Escape a literal path segment for use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compile a route pattern into a matcher plus the names of its parameters.
 *
 * ```ts
 * compileApiPath('/users/:id/posts') // { pattern: /^\/users\/([^/]+)\/posts$/, keys: ['id'] }
 * ```
 */
export function compileApiPath(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = []
  const source = normalizeApiPath(path)
    .split('/')
    .filter(segment => segment.length > 0)
    .map((segment) => {
      const param = PARAM_SEGMENT_RE.exec(segment)
      if (!param) return `/${escapeRegExp(segment)}`
      keys.push(param[1]!)
      return '/([^/]+)'
    })
    .join('')

  return { pattern: new RegExp(`^${source || '/'}$`), keys }
}

/** Decode a captured path parameter, keeping the raw value when it is invalid. */
function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * The runtime API router: one instance per application, built once during
 * startup from the scanned metadata and the controller class map.
 *
 * Construction instantiates every controller, so a controller that is missing
 * from the class map, declares a route method that does not exist, or repeats a
 * method + path pair fails startup loudly instead of silently dropping routes.
 *
 * ```ts
 * const router = new ApiRouter(apiControllersMetadata, apiControllersTypeMap)
 * const match = router.match('GET', '/users/42')
 * ```
 */
export class ApiRouter {
  readonly #controllers = new Map<string, { metadata: ApiControllerMetadata; instance: object }>()
  readonly #routes: ApiRouteEntry[] = []
  /** Every occupied `METHOD path` pair, used to reject duplicate routes. */
  readonly #pairs = new Set<string>()

  constructor(
    controllers: readonly ApiControllerMetadata[] = [],
    classes: ApiControllerClassMap = {},
  ) {
    for (const metadata of controllers) this.#register(metadata, classes)

    // Static segments win over parameter segments: `/users/me` must match
    // before `/users/:id`, even when the latter was declared first. Array#sort
    // is stable, so the declaration order breaks ties.
    this.#routes.sort((left, right) => left.keys.length - right.keys.length)
  }

  /** Every compiled route, ordered from least to most parameterised. */
  get routes(): readonly ApiRouteEntry[] {
    return this.#routes
  }

  /** Metadata of every registered controller, in registration order. */
  get controllers(): readonly ApiControllerMetadata[] {
    return [...this.#controllers.values()].map(entry => entry.metadata)
  }

  /**
   * Resolve the instance of a registered controller from its class name.
   *
   * @throws When the controller is not part of the scanned metadata.
   */
  getController<T extends object = object>(className: string): T {
    const entry = this.#controllers.get(className)
    if (!entry) {
      const message = `Api controller "${className}" is not registered.`
      logger.error(message)
      throw new Error(message)
    }
    return entry.instance as T
  }

  /**
   * Match a request against the route table.
   *
   * The method is case-insensitive and must be one of the route's methods
   * (`POST`). The path is normalised, so a trailing slash or a
   * duplicated separator does not affect the result.
   *
   * @returns The matched route with its decoded path parameters, or null.
   */
  match(method: string, path: string): ApiRouteMatch | null {
    const normalizedMethod = method.toUpperCase()
    const normalizedPath = normalizeApiPath(path)

    for (const entry of this.#routes) {
      if (!entry.route.methods.includes(normalizedMethod)) continue

      const result = entry.pattern.exec(normalizedPath)
      if (!result) continue

      const params: Record<string, string> = {}
      entry.keys.forEach((key, index) => {
        params[key] = decodeParam(result[index + 1]!)
      })

      return {
        method: normalizedMethod,
        controller: entry.controller,
        route: entry.route,
        path: entry.path,
        instance: entry.instance,
        handler: entry.handler,
        params,
      }
    }

    return null
  }

  /**
   * Match the request and invoke the handler, answering the JSON response.
   *
   * The handler receives a fully-populated {@link ApiRequestContext} only when
   * its method declares that parameter; otherwise it is called without
   * arguments.
   *
   * The answered value is the response itself:
   *  - `{}` when the handler returned nothing,
   *  - `{ text }` when it returned a string,
   *  - the handler result otherwise,
   *  - `{ error: { code: 404, message: 'Not Found' } }` when no route matched,
   *  - `{ error }` when the handler threw. A thrown `ApiError` keeps its `code`;
   *    any other error is reported as a `500`.
   */
  async dispatch(request: ApiDispatchRequest): Promise<ApiDispatchResponse> {
    const match = this.match(request.method, request.path)

    // A miss is answered like any other failure, so callers never have to
    // special-case an empty result.
    if (!match) return apiNotFoundBody()

    // Execution is shared with the HTTP entry: same context, same injection,
    // same JSON envelope and error handling.
    return executeApiRoute(
      {
        route: match.route,
        handler: match.handler,
        method: match.method,
        params: match.params,
      },
      request,
    )
  }

  /** Instantiate one controller and compile all of its routes. */
  #register(metadata: ApiControllerMetadata, classes: ApiControllerClassMap): void {
    const Controller = classes[metadata.className]
    if (typeof Controller !== 'function') {
      const message = `Api controller "${metadata.className}" is not present in the controller class map.`
      logger.error(message)
      throw new Error(message)
    }

    const instance = new Controller()
    const alreadyRegistered = this.#controllers.has(metadata.className)
    if (alreadyRegistered) {
      const message = `Api controller "${metadata.className}" is declared more than once.`
      logger.error(message)
      throw new Error(message)
    }

    for (const route of metadata.routes) {
      const fullPath = joinApiPaths(metadata.path, route.path)
      const pairs = route.methods.map(method => `${method} ${fullPath}`)

      // The same path may be served by several handlers as long as their
      // methods do not overlap; the pair is what must be unique.
      for (const pair of pairs) {
        if (this.#pairs.has(pair)) {
          const message = `Duplicate route "${pair}" on controller "${metadata.className}".`
          logger.error(message)
          throw new Error(message)
        }
      }
      for (const pair of pairs) this.#pairs.add(pair)

      const handler = (instance as Record<string, unknown>)[route.handler]
      if (typeof handler !== 'function') {
        const message = `Route "${fullPath}" points at "${route.handler}", which is not a method of controller "${metadata.className}".`
        logger.error(message)
        throw new Error(message)
      }

      const { pattern, keys } = compileApiPath(fullPath)
      this.#routes.push({
        controller: metadata,
        route,
        path: fullPath,
        instance,
        handler: handler.bind(instance) as ApiHandler,
        keys,
        pattern,
      })

      logger.info(`Registered api route "${fullPath}" (${route.methods.join(', ')}) -> ${metadata.className}.${route.handler}`)
    }

    this.#controllers.set(metadata.className, { metadata, instance })
  }
}
