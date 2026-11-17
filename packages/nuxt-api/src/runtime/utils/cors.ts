import { setResponseHeaders } from 'h3'
import type { H3Event } from 'h3'

// ---------------------------------------------------------------------------
// CORS
//
// Every route of the module is a public JSON endpoint, reachable from any
// origin by default. A deployment that needs to restrict origins can override
// these headers from Nitro middleware or a route rule.
// ---------------------------------------------------------------------------

/** Allow any origin to call the API, including the preflight request. */
export function applyApiCorsHeaders(event: H3Event): void {
  setResponseHeaders(event, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': 86400,
  })
}
