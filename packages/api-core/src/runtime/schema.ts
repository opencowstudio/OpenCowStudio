import type {
  ApiError,
  ApiSchema,
  ApiSchemaIssue,
  ApiSchemaRegistry,
  ApiValidationIssue,
  ApiValidationResult,
} from '../shared/types.ts'

// ---------------------------------------------------------------------------
// Schema validation + input resolution
//
// A handler parameter declaring a named type other than `ApiRequest` asks for
// the request JSON shaped into that type. At build time its type name is
// recorded; at runtime the body is validated by the schema registered under
// that name and the parsed value is injected. The core never imports a schema —
// it looks it up in the registry the Nuxt module generates, so any Standard
// Schema implementation (zod, valibot, ...) works.
// ---------------------------------------------------------------------------

/** Error answered when the request JSON does not match its input schema. */
export interface ApiValidationError extends ApiError {
  /** Every validation failure, in schema order. */
  issues: readonly ApiValidationIssue[]
}

/**
 * Whether a registry entry can validate a value.
 *
 * Only a [Standard Schema v1](https://standardschema.dev) implementation
 * qualifies. The registry is built from raw module exports, so entries that are
 * not schemas (helper constants, classes, `undefined` holes) have to be rejected
 * before use.
 */
export function isApiSchema(value: unknown): value is ApiSchema {
  return hasStandardSchema(value)
}

/**
 * Resolve the value injected into an input parameter.
 *
 * The body is validated and copied by the schema registered under
 * `typeName`, so the handler receives the parsed value rather than the raw JSON
 * object. An unregistered schema fails the request with a `500` (a build/runtime
 * mismatch), an invalid body with a `400`.
 *
 * @param registry The generated registry, keyed by schema name.
 * @param typeName The type name declared by the parameter.
 * @param body The request JSON.
 */
export function resolveApiInput(
  registry: ApiSchemaRegistry,
  typeName: string,
  body: Record<string, unknown>,
): unknown {
  const schema = registry[typeName]

  if (!isApiSchema(schema)) {
    throw {
      code: 500,
      message: `Schema "${typeName}" is not registered. Export it from the scanned schema directory, or fix the parameter type name.`,
    } satisfies ApiError
  }

  const result = validateApiValue(schema, body)
  if (!result.issues) return result.value

  throw {
    code: 400,
    message: formatApiIssues(result.issues),
    issues: result.issues,
  } satisfies ApiValidationError
}

/**
 * Validate a value with a Standard Schema and answer the issues instead of
 * throwing.
 *
 * The schema contract is exactly one method, so this is a thin wrapper — except
 * for two things: the async guard, because Standard Schema allows `validate` to
 * return a promise while the injection path is synchronous (answering a promise
 * would hand the handler a `Promise` instead of data, so it fails loudly as a
 * `500`), and the issue normalisation, because the standard reports
 * `PropertyKey[]` paths while the error body only renders string / number
 * segments.
 */
export function validateApiValue<T = unknown>(schema: ApiSchema<T>, value: unknown): ApiValidationResult<T> {
  if (!isApiSchema(schema)) {
    throw new Error('Unsupported schema: expected a Standard Schema v1 implementation.')
  }

  const result = schema['~standard'].validate(value)
  if (isPromise(result)) throw asyncSchemaError()
  if (result.issues) return { issues: normalizeApiIssues(result.issues) }
  return { value: result.value }
}

/**
 * Render the issues of a failed validation into one message.
 *
 * Kept in the error `message` (rather than a separate payload) so the existing
 * `{ error: { code, message } }` envelope carries the field paths without any
 * change: `Invalid request body: group.name is required; tags[0] ...`.
 */
export function formatApiIssues(issues: readonly ApiValidationIssue[]): string {
  const details = issues.map((issue) => {
    const path = formatApiIssuePath(issue.path)
    return path ? `${path} ${issue.message}` : issue.message
  })
  return `Invalid request body: ${details.join('; ')}`
}

/** Render an issue path as `group.tags[0].name`. */
export function formatApiIssuePath(path: readonly (string | number)[] | undefined): string {
  if (!path || path.length === 0) return ''

  return path.reduce<string>((rendered, segment) => {
    if (typeof segment === 'number') return `${rendered}[${segment}]`
    return rendered ? `${rendered}.${segment}` : segment
  }, '')
}

function hasStandardSchema(value: unknown): value is ApiSchema {
  if (typeof value !== 'object' || value === null) return false
  const standard = (value as { '~standard'?: { validate?: unknown } })['~standard']
  return typeof standard === 'object' && standard !== null && typeof standard.validate === 'function'
}

/**
 * Keep only the segments the framework can render.
 *
 * Standard Schema allows symbol keys in a path; the error body only renders
 * names and indices, so those segments are dropped rather than leaking a
 * symbol into the JSON message.
 */
function normalizeApiIssues(issues: readonly ApiSchemaIssue[]): readonly ApiValidationIssue[] {
  return issues.map((issue) => {
    const path = issue.path?.filter((segment): segment is string | number =>
      typeof segment === 'string' || typeof segment === 'number')
    return path && path.length > 0 ? { message: issue.message, path } : { message: issue.message }
  })
}

function asyncSchemaError(): Error {
  return new Error('Async schemas are not supported: the request JSON is validated synchronously.')
}

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
}
