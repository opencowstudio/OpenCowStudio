import {
  defineEventHandler,
  getQuery,
  getRequestHeaders,
  getRequestURL,
  readBody,
  setResponseHeader,
} from 'h3'
import type { H3Event } from 'h3'
import { apiNotFoundBody } from '@opencowstudio/api-core'
import type { ApiDispatchResponse } from '@opencowstudio/api-core'
import { apiPrefix } from '#api-manifest'
import { applyApiCorsHeaders } from '../utils/cors'
import { API_BODY_METHODS, stripApiPrefix } from '../utils/request'
import { useApiRouter } from '../utils/router'

// ---------------------------------------------------------------------------
// The HTTP entry of the module
//
// Nitro forwards every request below the mount prefix here. Unlike a per-route
// registration, this single handler does not rely on the framework's matcher:
// it hands the `path + method` to the router, which is the same pipeline the
// unit tests drive through `ApiRouter.dispatch`.
//
// That keeps one place to grow: permission checks, request validation and
// response validation live in the shared pipeline (`executeApiRoute`) and apply
// to both entries.
//
// The answer is always JSON with the `200` status — failures travel in the body
// as `{ error: { code, message } }`, never in the status line.
// ---------------------------------------------------------------------------

export default defineEventHandler(async (event) => {
  // Every route is cross-origin by default.
  applyApiCorsHeaders(event)

  // Preflight: answered here, since no route is registered for OPTIONS.
  if (event.method.toUpperCase() === 'OPTIONS') return ''

  const path = stripApiPrefix(apiPrefix, getRequestURL(event).pathname)
  if (path === null) return respond(event, apiNotFoundBody())

  let body: unknown
  try {
    body = await readApiBody(event)
  } catch {
    return respond(event, { error: { code: 400, message: 'Invalid JSON request body.' } })
  }

  // No matching route answers a `404` `ApiError`, just like `dispatch` does.
  const response = await useApiRouter().dispatch({
    method: event.method,
    path,
    query: getQuery(event),
    headers: getRequestHeaders(event),
    body,
    event,
  })

  return respond(event, response)
})

/** Parse the JSON body, only for the methods that can carry one. */
async function readApiBody(event: H3Event): Promise<unknown> {
  if (!API_BODY_METHODS.has(event.method.toUpperCase())) return undefined
  return await readBody(event)
}

/** Answer a JSON body; the status stays at `200`. */
function respond(event: H3Event, body: ApiDispatchResponse): string {
  setResponseHeader(event, 'content-type', 'application/json')
  return JSON.stringify(body)
}
