import { createResolver, useLogger } from '@nuxt/kit'
import { joinApiPaths, normalizeApiPath } from '@opencowstudio/api-core'
import type { ApiControllerMetadata, ApiMethod } from '@opencowstudio/api-core'

const MODULE_NAME = '@opencowstudio/nuxt-api'

/** One declared `path + method` pair, registered as its own Nitro route. */
export interface ApiRouteRegistration {
  /** Full route path, including the mount prefix. */
  route: string
  /** HTTP method the entry answers, upper-cased. */
  method: ApiMethod
}

/** The Nitro handler entries produced from one scan. */
export interface ApiHandlerRegistration {
  /** Declared routes, each visible in Nitro's route table. */
  routes: ApiRouteRegistration[]
  /** Catch-all patterns serving preflight, unknown paths and other verbs. */
  fallbacks: string[]
  /** Absolute path of the runtime handler module shared by every entry. */
  handler: string
}

/**
 * Turn every scanned route into its own Nitro entry, plus a catch-all fallback.
 *
 * Every declared `path + method` is registered separately so the route shows up
 * in Nitro's route table (devtools, `nitro.scanHandlers`, route rules) exactly
 * like a file-based `server/api` route.
 *
 * All entries — declared routes and fallbacks alike — point at the same runtime
 * module, which matches the request through the router and runs the shared
 * execution pipeline. Adding permission checks or request/response validation
 * therefore still touches a single place, and a request whose `path + method`
 * matches no route (unknown path, `PUT`, ...) is answered by the catch-all with
 * a JSON `404` `ApiError`.
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

  // Catch-all entries answer what no declared route matched: the OPTIONS
  // preflight, unknown paths and other verbs. They are skipped when the module
  // is mounted at the root, where a wildcard would swallow the Nuxt app.
  const declaredPaths = new Set(routes.map(entry => entry.route))
  const fallbacks = normalizedPrefix === '/'
    ? []
    : [
        ...(declaredPaths.has(normalizedPrefix) ? [] : [normalizedPrefix]),
        `${normalizedPrefix}/**`,
      ]

  logger.info(
    `Registered ${routes.length} api route(s) on "${normalizedPrefix}" (fallbacks: ${fallbacks.join(', ') || 'none'})`,
  )

  return { routes, fallbacks, handler: resolver.resolve('../runtime/server/api') }
}
