import {
  defineEventHandler,
  getQuery,
  getRequestHeaders,
  getRequestURL,
  getRouterParams,
  readBody,
} from 'h3'
import type { EventHandler } from 'h3'
import type { ApiMethod, ApiRequestContext } from '@opencowstudio/api-core'
import { apiPrefix } from '#api-manifest'
import { API_BODY_METHODS, stripApiPrefix } from './request'
import { useApiRouter } from './router'

// ---------------------------------------------------------------------------
// Shared body of every generated route handler
//
// The module generates one Nitro handler module per `path + method` pair, and
// each of them only names a controller class and one of its methods. This
// factory turns that pair into an h3 handler: Nitro already matched the route
// and its method, so the only work left is building an `ApiRequestContext` and
// invoking the singleton controller method.
// ---------------------------------------------------------------------------

/**
 * Build the h3 handler of one generated route.
 *
 * @param className Class name of the controller, as recorded in the manifest.
 * @param handlerName Method of that controller answering the route.
 */
export function createApiHandler(className: string, handlerName: string): EventHandler {
  return defineEventHandler(async (event) => {
    const method = event.method.toUpperCase() as ApiMethod

    // Nitro only runs this handler for a matched route, so the request path is
    // guaranteed to sit below the mount prefix; the fallback keeps the context
    // path meaningful if the prefix is changed between build and runtime.
    const requestPath = getRequestURL(event).pathname
    const path = stripApiPrefix(apiPrefix, requestPath) ?? requestPath

    const controller = useApiRouter().getController(className)
    const handler = (controller as Record<string, unknown>)[handlerName]
    if (typeof handler !== 'function') {
      throw new Error(
        `Api controller "${className}" has no handler method "${handlerName}".`,
      )
    }

    const context: ApiRequestContext = {
      method,
      path,
      params: getRouterParams(event),
      query: getQuery(event),
      headers: getRequestHeaders(event),
      body: API_BODY_METHODS.has(method) ? await readBody(event) : undefined,
      event,
    }

    // A handler that returns nothing still answered the request, so the response
    // must not fall through to the next handler.
    return (await handler.call(controller, context)) ?? null
  })
}
