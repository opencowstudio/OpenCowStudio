import { createResolver, useLogger } from '@nuxt/kit'
import { normalizeApiPath } from '@opencowstudio/api-core'
import type { ApiControllerMetadata } from '@opencowstudio/api-core'

const MODULE_NAME = '@opencowstudio/nuxt-api'

/** The single Nitro handler serving the whole API surface. */
export interface ApiHandlerRegistration {
  /** Route patterns handed to Nitro, including the mount prefix. */
  routes: string[]
  /** Absolute path of the runtime handler module. */
  handler: string
  /** Number of declared path + method pairs, kept for logging. */
  count: number
}

/**
 * Register the Nitro handler that serves every request below the mount prefix.
 *
 * One catch-all replaces a generated module per `path + method`: the runtime
 * handler hands the request to the router, which matches it and runs the shared
 * execution pipeline. Adding permission checks or request/response validation
 * therefore touches a single place, and a request whose `path + method` matches
 * no route still answers a JSON `404` `ApiError`.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @param controllers The resolved controller metadata, used for the log line.
 * @param prefix Mount prefix prepended to every route.
 */
export function registerApiHandler(
  controllers: readonly ApiControllerMetadata[],
  prefix: string,
): ApiHandlerRegistration {
  const logger = useLogger(MODULE_NAME)
  const resolver = createResolver(import.meta.url)
  const normalizedPrefix = normalizeApiPath(prefix)

  // The bare prefix answers `/api` itself; the wildcard covers everything below.
  const routes = normalizedPrefix === '/'
    ? ['/', '/**']
    : [normalizedPrefix, `${normalizedPrefix}/**`]

  const count = controllers.reduce(
    (total, controller) =>
      total + controller.routes.reduce((sum, route) => sum + route.methods.length, 0),
    0,
  )
  logger.info(`Serving ${count} api route(s) through the catch-all handler "${normalizedPrefix}"`)

  return { routes, handler: resolver.resolve('../runtime/server/api'), count }
}
