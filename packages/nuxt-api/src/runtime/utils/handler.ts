import {
  defineEventHandler,
  getQuery,
  getRequestHeaders,
  getRequestURL,
  getRouterParams,
  readBody,
  setResponseHeader,
  setResponseStatus,
} from 'h3'
import type { EventHandler, H3Event } from 'h3'
import { consola } from 'consola'
import { toApiErrorBody, toApiResponse } from '@opencowstudio/api-core'
import type { ApiMethod, ApiRequestContext } from '@opencowstudio/api-core'
import { apiPrefix } from '#api-manifest'
import { API_BODY_METHODS, stripApiPrefix } from './request'
import { useApiRouter } from './router'

const logger = consola.withTag('nuxt-api')

// ---------------------------------------------------------------------------
// Shared body of every generated route handler
//
// The module generates one Nitro handler module per `path + method` pair, and
// each of them only names a controller class, one of its methods and whether
// that method declares the `ApiRequestContext` parameter. This factory turns
// that trio into an h3 handler: Nitro already matched the route and its method,
// so the only work left is building the context (when declared) and invoking
// the singleton controller method.
//
// Routes are JSON endpoints, in and out: the request body is parsed as JSON and
// the answer is always a JSON document, including failures
// (`{ error: { code, message } }`, with the HTTP status set from `code`).
// ---------------------------------------------------------------------------

/**
 * Build the h3 handler of one generated route.
 *
 * @param className Class name of the controller, as recorded in the manifest.
 * @param handlerName Method of that controller answering the route.
 * @param injectsContext Whether that method declares the `ApiRequestContext`
 *        parameter; when false the method is invoked without arguments.
 */
export function createApiHandler(
  className: string,
  handlerName: string,
  injectsContext: boolean,
): EventHandler {
  return defineEventHandler(async (event) => {
    try {
      const controller = useApiRouter().getController(className)
      const handler = (controller as Record<string, unknown>)[handlerName]
      if (typeof handler !== 'function') {
        throw new Error(
          `Api controller "${className}" has no handler method "${handlerName}".`,
        )
      }

      // The context is built lazily: a handler that declares no parameter never
      // reaches the request (so the body is not consumed either).
      const value = injectsContext
        ? await handler.call(controller, await createRequestContext(event))
        : await handler.call(controller)

      // The result is normalised once (`{}` when empty, `{ text }` when it
      // cannot be represented as JSON) so the body is always valid JSON.
      setResponseHeader(event, 'content-type', 'application/json')
      return JSON.stringify(toApiResponse(value))
    } catch (thrown) {
      // The failure is part of the JSON contract, so it is answered instead of
      // bubbling up: the status code comes from the error (500 by default).
      const body = toApiErrorBody(thrown)
      logger.error(
        `Api route "${event.method} ${getRequestURL(event).pathname}" failed: ${body.error.code} ${body.error.message}`,
      )
      setResponseStatus(event, body.error.code)
      setResponseHeader(event, 'content-type', 'application/json')
      return JSON.stringify(body)
    }
  })
}

/**
 * Build the {@link ApiRequestContext} of one matched request.
 *
 * The body is parsed as JSON, and only for the methods that can carry one.
 */
async function createRequestContext(event: H3Event): Promise<ApiRequestContext> {
  const method = event.method.toUpperCase() as ApiMethod

  // Nitro only runs this handler for a matched route, so the request path is
  // guaranteed to sit below the mount prefix; the fallback keeps the context
  // path meaningful if the prefix is changed between build and runtime.
  const requestPath = getRequestURL(event).pathname
  const path = stripApiPrefix(apiPrefix, requestPath) ?? requestPath

  return {
    method,
    path,
    params: getRouterParams(event),
    query: getQuery(event),
    headers: getRequestHeaders(event),
    body: API_BODY_METHODS.has(method) ? await readBody(event) : undefined,
    event,
  }
}
