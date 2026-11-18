// ---------------------------------------------------------------------------
// API contract shared by the build-time parser and the runtime router.
//
// `builder/parser.ts` produces `ApiControllerMetadata` from decorator source,
// and `runtime/router.ts` turns that metadata into a dispatchable route table.
// Both layers depend on this file, so it carries no `typescript` import and no
// framework dependency.
// ---------------------------------------------------------------------------

/**
 * Methods every controller route answers. `@ApiRoute` cannot override them, so
 * a controller is a collection of `POST` endpoints.
 */
export const DEFAULT_API_METHODS = ['POST'] as const

/**
 * A request value that can be injected into a handler parameter.
 *
 * The injected value is selected by the parameter's declared type; today only
 * `ApiRequestContext` is injectable. Adding a type means adding an entry here,
 * a mapping in the parser and a case in `toApiArguments`.
 */
export type ApiParameterSource = 'context'

/** One handler parameter, with the request value injected into it. */
export interface ApiRouteParameter {
  /** Declared parameter name, kept for diagnostics and documentation. */
  name: string
  /** Request value injected into the parameter, chosen by its declared type. */
  source: ApiParameterSource
}

/** A single route of a controller, resolved from an `@ApiRoute` decorator. */
export interface ApiRouteMetadata {
  /** Name of the controller method that handles the request. */
  handler: string
  /** HTTP methods the handler answers; always {@link DEFAULT_API_METHODS}. */
  methods: string[]
  /**
   * Parameters of the handler, in declaration order.
   *
   * Each one receives the request value its declared type selects, whatever its
   * position; a handler declaring no parameter yields an empty list and is
   * invoked without arguments.
   */
  parameters: ApiRouteParameter[]
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
export interface ApiRequestContext {
  /** Route-relative request path, e.g. `/42`. */
  path: string
  /** Path parameters captured from the route pattern. */
  params: Record<string, string>
  /** Query string parameters; a repeated key keeps every value. */
  query: Record<string, string | string[]>
  /** Request headers, lower-cased by the HTTP adapter. */
  headers: Record<string, string | undefined>
  /**
   * Parsed request body, always a JSON object.
   *
   * A request without a body yields `{}`. Any other shape — an array, a
   * primitive, `null` — is rejected before the handler runs, with a
   * `400 Bad Request` error body.
   */
  body: Record<string, unknown>
  /** Framework request object (the H3 event under Nitro); opaque to the core. */
  event?: unknown
}

/**
 * An error answered by a route, carried by the JSON body `{ error: ApiError }`.
 *
 * A handler can throw such an object to control the response (status code and
 * message); anything else thrown is reported as a `500`.
 */
export interface ApiError {
  /** HTTP status code, between 400 and 599. */
  code: number
  /** Human-readable error message. */
  message: string
}

/** JSON body of a failed route: `{ "error": { "code": 400, "message": "..." } }`. */
export interface ApiErrorResponse {
  /** The error carried by the response. */
  error: ApiError
}
