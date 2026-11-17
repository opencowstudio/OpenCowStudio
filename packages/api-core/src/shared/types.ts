// ---------------------------------------------------------------------------
// API contract shared by the build-time parser and the runtime router.
//
// `builder/parser.ts` produces `ApiControllerMetadata` from decorator source,
// and `runtime/router.ts` turns that metadata into a dispatchable route table.
// Both layers depend on this file, so it carries no `typescript` import and no
// framework dependency.
// ---------------------------------------------------------------------------

/** Every HTTP method a request may carry. */
export const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

/**
 * Methods every controller route answers. `@ApiRoute` cannot override them.
 *
 * The order is the order the methods are registered in, not a routing
 * precedence: every method is matched independently.
 */
export const DEFAULT_API_METHODS = ['GET', 'POST'] as const

/** An HTTP method a route answers. */
export type ApiMethod = (typeof API_METHODS)[number]

/** A single route of a controller, resolved from an `@ApiRoute` decorator. */
export interface ApiRouteMetadata {
  /** Name of the controller method that handles the request. */
  handler: string
  /** HTTP methods the handler answers; always {@link DEFAULT_API_METHODS}. */
  methods: ApiMethod[]
  /**
   * One concrete path of the route, relative to the mount prefix, normalised.
   *
   * A decorator declaring several paths yields one metadata entry per path.
   */
  path: string
  /** Route name; always `${className}.${handler}`, shared by every path. */
  name: string
  /** Human-readable description, defaults to ''. */
  description: string
}

/** A controller class, resolved from an `@ApiController` decorator. */
export interface ApiControllerMetadata {
  /** Class name of the controller, e.g. `UserController`. */
  className: string
  /** Unique controller name; always the class name. */
  name: string
  /**
   * Base path of the controller; always `/`, because every route declares its
   * full path through `@ApiRoute`.
   */
  path: string
  /** Human-readable description, defaults to ''. */
  description: string
  /** Path of the module declaring the class, as recorded by the parser caller. */
  modulePath: string
  /** Routes declared with `@ApiRoute`, in declaration order. */
  routes: ApiRouteMetadata[]
}

/** The request handed to a route handler. */
export interface ApiRequestContext<TBody = unknown> {
  /** HTTP method of the request, upper-cased. */
  method: ApiMethod
  /** Route-relative request path, e.g. `/42`. */
  path: string
  /** Path parameters captured from the route pattern. */
  params: Record<string, string>
  /** Query string parameters; a repeated key keeps every value. */
  query: Record<string, string | string[]>
  /** Request headers, lower-cased by the HTTP adapter. */
  headers: Record<string, string | undefined>
  /** Parsed request body, when the HTTP adapter parsed one. */
  body: TBody
  /** Framework request object (the H3 event under Nitro); opaque to the core. */
  event?: unknown
}
