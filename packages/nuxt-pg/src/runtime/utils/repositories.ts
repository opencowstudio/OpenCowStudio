import { PgRepositories } from '@opencowstudio/pg-core'

// ---------------------------------------------------------------------------
// Injected repository service
//
// The service is built by the bootstrap Nitro plugin, once every repository of
// the scanned entities has been registered, and stored here so server code can
// reach it without importing the manifest or holding the datasource manager.
//
// The holder is module-level on purpose: `bootstrap.ts` and the auto-imported
// `usePgRepositories` resolve to the same module, so a handler sees the instance
// the plugin injected. Nothing but the plugin may write it.
// ---------------------------------------------------------------------------

let repositories: PgRepositories | null = null

/**
 * Store the repository service built during startup.
 *
 * Not auto-imported — it is the injection point of the bootstrap plugin, not an
 * application API.
 */
export function setPgRepositories(service: PgRepositories): void {
  repositories = service
}

/**
 * The repository service of `@opencowstudio/nuxt-pg`, auto-imported in Nitro
 * server code.
 *
 * ```ts
 * const userAccounts = usePgRepositories().get(UserAccount)
 * const account = await userAccounts.findById(id)
 * ```
 *
 * @throws When the module never installed the service, i.e. startup found no
 *         pg configuration or the bootstrap plugin has not run yet.
 */
export function usePgRepositories(): PgRepositories {
  if (!repositories) {
    throw new Error(
      'Pg repositories are not available: the nuxt-pg bootstrap did not register them '
        + '(no pg configuration found?).',
    )
  }

  return repositories
}
