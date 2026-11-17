import type { ApiError, ApiErrorResponse } from '../shared/types.ts'

// ---------------------------------------------------------------------------
// JSON response helpers
//
// Every route answers JSON. These helpers turn a handler outcome into the
// response value itself — there is no envelope — so the router (`dispatch`) and
// the HTTP adapters cannot disagree:
//
//   * no result (`undefined`) -> `{}`,
//   * a string                -> `{ text }` (a bare string is not an object),
//   * anything else           -> the value itself,
//   * failure                 -> `{ error: { code, message } }`.
// ---------------------------------------------------------------------------

/** Whether a `code` is an HTTP error status (400–599). */
function isErrorCode(code: unknown): code is number {
  return typeof code === 'number' && Number.isInteger(code) && code >= 400 && code <= 599
}

/**
 * Whether a value is an {@link ApiError}.
 *
 * Handlers may throw a plain object shaped `{ code, message }`; the check is
 * structural so no class instance is required.
 */
export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false
  const { code, message } = value as Partial<ApiError>
  return isErrorCode(code) && typeof message === 'string'
}

/**
 * Normalise anything a handler threw into an {@link ApiError}.
 *
 * A thrown `{ code, message }` object is kept as-is (so a handler controls the
 * response), an `Error` becomes a `500` carrying its message, and any other
 * value becomes the generic `500` error.
 */
export function toApiError(thrown: unknown): ApiError {
  if (isApiError(thrown)) {
    return { code: thrown.code, message: thrown.message }
  }
  if (thrown instanceof Error && thrown.message.length > 0) {
    return { code: 500, message: thrown.message }
  }
  if (typeof thrown === 'string' && thrown.length > 0) {
    return { code: 500, message: thrown }
  }
  return { code: 500, message: 'Internal Server Error' }
}

/** Read the {@link ApiError} a response carries, if any. */
export function getApiError(response: unknown): ApiError | undefined {
  if (typeof response !== 'object' || response === null || Array.isArray(response)) return undefined

  const candidate = (response as { error?: unknown }).error
  return isApiError(candidate) ? candidate : undefined
}

/**
 * Turn a handler result into the JSON response.
 *
 * A method that returns nothing answers `{}`; a string is wrapped as
 * `{ text }`, because a bare string is not a JSON object; every other value is
 * answered as-is.
 */
export function toApiResponse(value: unknown): { [key: string]: unknown } {
  if (value === undefined) return {}
  if (typeof value === 'string') return { text: value }
  return value as { [key: string]: unknown }
}

/** Build the JSON body of a failed route: `{ error }`. */
export function toApiErrorBody(thrown: unknown): ApiErrorResponse {
  return { error: toApiError(thrown) }
}
