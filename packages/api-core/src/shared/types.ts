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
 * A value of the protocol layer that can be injected into a handler parameter.
 *
 *  - `'request'`: the whole {@link ApiRequest}, selected by declaring that type.
 *  - `'input'`: the request JSON (`ApiRequest.body`) parsed and validated by the
 *    input schema whose name matches the parameter's declared type. Any number
 *    of input parameters may be declared, and every one of them receives its own
 *    parsed copy of the same body.
 */
export type ApiParameterSource = 'request' | 'input'

/** One handler parameter, with the protocol value injected into it. */
export interface ApiRouteParameter {
  /** Declared parameter name, kept for diagnostics and documentation. */
  name: string
  /** Value injected into the parameter, chosen by its declared type. */
  source: ApiParameterSource
  /**
   * Declared type name of an `'input'` parameter, e.g. `CreateUserInput`.
   *
   * The runtime resolves it against the generated schema registry, so the
   * schema and the parameter type must share one name.
   */
  inputTypeName?: string
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
  /**
   * Name of the output schema the handler returns, when its return type is a
   * named type (a `Promise` wrapper is unwrapped).
   *
   * Only recorded, never enforced by the router: it is what the OpenAPI
   * generation reads to describe the response JSON, and it is `undefined` for a
   * handler returning `unknown`, `void`, an array or a union.
   */
  output?: string
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
export interface ApiRequest {
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

// === Schemas (input / output shapes) =====================================

/**
 * One validation failure as the framework reports it: a message and the
 * renderable location of the offending value.
 */
export interface ApiValidationIssue {
  /** Human-readable message. */
  message: string
  /** Location of the offending value, e.g. `['group', 'name']`. */
  path?: readonly (string | number)[]
}

/**
 * One validation failure as a schema reports it.
 *
 * `path` is `PropertyKey[]` because that is what Standard Schema v1 allows (a
 * symbol key is legal); the runtime narrows it to the string / number segments
 * of {@link ApiValidationIssue} before an issue leaves the package.
 */
export interface ApiSchemaIssue {
  /** Human-readable message. */
  message: string
  /** Location of the offending value, e.g. `['group', 'name']`. */
  path?: readonly PropertyKey[]
}

/** Outcome of validating a value against a schema. */
export type ApiValidationResult<T = unknown> =
  | { value: T; issues?: undefined }
  | { value?: undefined; issues: readonly ApiValidationIssue[] }

/** Outcome of a Standard Schema `validate` call. */
export type ApiSchemaResult<T = unknown> =
  | { value: T; issues?: undefined }
  | { value?: undefined; issues: readonly ApiSchemaIssue[] }

/**
 * A schema the framework can validate with: a
 * [Standard Schema v1](https://standardschema.dev) implementation.
 *
 * That single interface is the whole contract. zod 4 and valibot 1.x both
 * implement it, so the framework never depends on a validator and never
 * special-cases a library's `parse` / `safeParse` variants. A schema that only
 * offers those (zod 3, for instance) has to be wrapped into a Standard Schema
 * first.
 */
export interface ApiSchema<T = unknown> {
  '~standard': {
    version: 1
    validate: (value: unknown) => ApiSchemaResult<T> | Promise<ApiSchemaResult<T>>
  }
}

/**
 * The schemas of an application, keyed by type name.
 *
 * Generated at build time from the exported values of the scanned schema
 * directory, and resolved by a handler parameter's declared type name.
 */
export type ApiSchemaRegistry = Record<string, unknown>
