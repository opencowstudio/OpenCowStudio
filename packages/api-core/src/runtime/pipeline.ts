import { consola } from 'consola'
import { normalizeApiPath } from '../shared/path.ts'
import type { ApiRequestContext, ApiRouteMetadata } from '../shared/types.ts'
import { toApiArguments } from './arguments.ts'
import { toApiError, toApiResponse } from './response.ts'

const logger = consola.withTag('api-router')

// ---------------------------------------------------------------------------
// Route execution pipeline
//
// One implementation of "run a controller handler and answer JSON", shared by
// every entry point:
//
//   * the HTTP entry (`createApiHandler` in `@opencowstudio/nuxt-api`), and
//   * the unit-test entry (`ApiRouter.dispatch`).
//
// Cross-cutting behaviour — permission checks, request validation, response
// validation, metrics — belongs here, so it applies to both entries at once.
// ---------------------------------------------------------------------------

/** The JSON body answered by one API request. */
export type ApiResponseBody = { [key: string]: unknown }

/** The request handed to the pipeline, independent of the HTTP framework. */
export interface ApiPipelineRequest {
  /** HTTP method of the request; case-insensitive. */
  method: string
  /** Path of the request, relative to the mount prefix. */
  path: string
  /** Query string parameters. */
  query?: Record<string, string | string[]>
  /** Request headers. */
  headers?: Record<string, string | undefined>
  /** Parsed request body; it must be a JSON object to reach the handler. */
  body?: unknown
  /** Framework request object, forwarded to the handler untouched. */
  event?: unknown
}

/** A matched route, ready to be executed. */
export interface ApiRouteTarget {
  /** Metadata of the matched route. */
  route: ApiRouteMetadata
  /** Handler bound to its controller instance. */
  handler: (...args: unknown[]) => unknown
  /** HTTP method the route matched. */
  method: string
  /** Path parameters captured by the matcher. */
  params: Record<string, string>
}

/** Build the JSON body answered when no route matches the request. */
export function apiNotFoundBody(): ApiResponseBody {
  return { error: { code: 404, message: 'Not Found' } }
}

/** Build the JSON body answered when the request body is not a JSON object. */
export function apiBadRequestBody(): ApiResponseBody {
  return { error: { code: 400, message: 'Bad Request' } }
}

/**
 * The body handed to the handler.
 *
 * A request without a payload yields an empty object. Every other shape — an
 * array, a primitive, `null` — is rejected by answering `null`, so the caller
 * can fail the request before the handler runs.
 */
function resolveApiBody(body: unknown): Record<string, unknown> | null {
  if (body === undefined) return {}
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  return body as Record<string, unknown>
}

/**
 * Execute a matched route and answer its JSON body.
 *
 * Steps, in order:
 *  1. build the {@link ApiRequestContext} from the request,
 *  2. run the pre-handler phase — permission checks and request validation,
 *  3. invoke the handler with the values its parameters declare,
 *  4. run the post-handler phase — response validation,
 *  5. normalise the result into the JSON response.
 *
 * Failures at any step are answered as `{ error: { code, message } }`, never
 * thrown: the response status is always `200`, the error travels in the body.
 */
export async function executeApiRoute(
  target: ApiRouteTarget,
  request: ApiPipelineRequest,
): Promise<ApiResponseBody> {
  // The body must be a JSON object: an array or a primitive is a bad request,
  // answered before the handler runs.
  const body = resolveApiBody(request.body)
  if (body === null) return apiBadRequestBody()

  const context: ApiRequestContext = {
    path: normalizeApiPath(request.path),
    params: target.params,
    query: request.query ?? {},
    headers: request.headers ?? {},
    body,
    event: request.event,
  }

  try {
    // Pre-handler phase: permission checks, request validation, ... (context,
    // target.route and target.handler are all available here).

    const sources = target.route.parameters.map(parameter => parameter.source)
    const value = await target.handler(...toApiArguments(context, sources))

    // Post-handler phase: response validation, ... (`value` is the result).

    return toApiResponse(value)
  } catch (thrown) {
    const error = toApiError(thrown)
    logger.error(`Api route "${target.method} ${context.path}" failed: ${error.code} ${error.message}`)
    return { error }
  }
}
