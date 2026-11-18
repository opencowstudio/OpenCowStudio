import { createResolver, useLogger } from '@nuxt/kit'
import { joinApiPaths, normalizeApiPath } from '@opencowstudio/api-core'
import type { ApiControllerMetadata } from '@opencowstudio/api-core'

const MODULE_NAME = '@opencowstudio/nuxt-api'

/** One declared `path + method` pair, registered as its own Nitro route. */
export interface ApiRouteRegistration {
  /** Full route path, including the mount prefix. */
  route: string
  /** HTTP method the entry answers, upper-cased. */
  method: string
}

/** The Nitro handler entries produced from one scan. */
export interface ApiHandlerRegistration {
  /** Declared routes plus one `OPTIONS` preflight per path. */
  routes: ApiRouteRegistration[]
  /** Absolute path of the runtime handler module shared by every entry. */
  handler: string
}

/**
 * Turn every scanned route into its own Nitro entry, plus the `OPTIONS`
 * preflight of every path.
 *
 * Every declared `path + method` is registered separately so the route shows up
 * in Nitro's route table (devtools, `nitro.scanHandlers`, route rules) exactly
 * like a file-based `server/api` route.
 *
 * One `OPTIONS` entry per path answers the CORS preflight, so the runtime
 * handler — the only place that sets the CORS headers — runs before the browser
 * sends the real request. A path served by several methods still gets a single
 * preflight entry.
 *
 * All entries point at the same runtime module, which matches the request
 * through the router and runs the shared execution pipeline. Adding permission
 * checks or request/response validation therefore still touches a single place.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @param controllers The resolved controller metadata.
 * @param prefix Mount prefix prepended to every route.
 */
export function registerApiHandlers(
  controllers: readonly ApiControllerMetadata[],
  prefix: string,
): ApiHandlerRegistration {
  const logger = useLogger(MODULE_NAME)
  const resolver = createResolver(import.meta.url)
  const normalizedPrefix = normalizeApiPath(prefix)

  const routes: ApiRouteRegistration[] = []
  for (const controller of controllers) {
    for (const route of controller.routes) {
      const fullPath = joinApiPaths(normalizedPrefix, route.path)
      for (const method of route.methods) routes.push({ route: fullPath, method })
    }
  }

  // One preflight per path: a path answered by several methods needs a single
  // OPTIONS handler, not one per method.
  const preflights: ApiRouteRegistration[] = [...new Set(routes.map(entry => entry.route))]
    .map(route => ({ route, method: 'OPTIONS' }))

  logger.info(
    `Registered ${routes.length} api route(s) on "${normalizedPrefix}" (preflight: ${preflights.length})`,
  )

  return { routes: [...routes, ...preflights], handler: resolver.resolve('../runtime/server/api') }
}
