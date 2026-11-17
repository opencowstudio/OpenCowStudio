import type { ApiRouter } from '@opencowstudio/api-core'

// ---------------------------------------------------------------------------
// Injected router service
//
// The service is built by the bootstrap Nitro plugin, once the scanned
// controllers have been instantiated and their routes compiled, and stored here
// so server code can reach it without importing the manifest.
//
// The holder is module-level on purpose: `bootstrap.ts` and the auto-imported
// `useApiRouter` resolve to the same module, so a handler sees the instance the
// plugin injected. Nothing but the plugin may write it.
// ---------------------------------------------------------------------------

let router: ApiRouter | null = null

/**
 * Store the router built during startup.
 *
 * Not auto-imported — it is the injection point of the bootstrap plugin, not an
 * application API.
 */
export function setApiRouter(service: ApiRouter): void {
  router = service
}

/**
 * The router of `@opencowstudio/nuxt-api`, auto-imported in Nitro server code.
 *
 * ```ts
 * const controller = useApiRouter().getController<UserController>('UserController')
 * const match = useApiRouter().match('GET', '/users/42')
 * ```
 *
 * @throws When the module never installed the service, i.e. the bootstrap
 *         plugin has not run yet.
 */
export function useApiRouter(): ApiRouter {
  if (!router) {
    throw new Error(
      'The api router is not available: the nuxt-api bootstrap did not register it.',
    )
  }

  return router
}
