import { addServerHandler, addServerImports, addServerPlugin, createResolver } from '@nuxt/kit'
import type { Nuxt } from 'nuxt/schema'
import type { ModuleOptions } from '../module'
import { registerApiHandler } from './handlers'
import { registerApiManifest } from './manifest'

/**
 * Bootstrap the nuxt-api module at build time:
 *  1. scan the controller source files and bake the API manifest,
 *  2. register the Nitro plugin that instantiates the router,
 *  3. auto-import the injected router service in Nitro server code,
 *  4. register the single Nitro handler serving every route below the prefix.
 *
 * Extracted from `defineNuxtModule`'s `setup` hook so the orchestration can be
 * unit-tested without booting a full Nuxt build. The public module entry
 * (`module.ts`) delegates to this function.
 */
export async function setupModule(options: ModuleOptions, nuxt: Nuxt): Promise<void> {
  if (!options.enabled) {
    return
  }

  const resolver = createResolver(import.meta.url)

  // Scan the controller source files, resolve each controller into an
  // `ApiControllerMetadata`, and bake the collection (plus the mount prefix)
  // into a server-only manifest at build time. The runtime imports the typed
  // metadata directly.
  const { controllers } = await registerApiManifest(nuxt, options.dir!, options.prefix!)

  // Register the Nitro plugin that instantiates the router from the manifest
  // and injects the router service.
  addServerPlugin(resolver.resolve('../runtime/plugins/bootstrap'))

  // Expose the injected router service to server code: `useApiRouter()` is
  // auto-imported in Nitro handlers, so a handler can resolve a controller
  // instance without importing the module's runtime files.
  addServerImports([
    {
      name: 'useApiRouter',
      from: resolver.resolve('../runtime/utils/router'),
    },
  ])

  // One handler serves the whole prefix: it matches `path + method` through the
  // router at runtime, so the HTTP entry and `ApiRouter.dispatch` run the same
  // pipeline and an unmatched request answers a JSON 404.
  const { routes, handler } = registerApiHandler(controllers, options.prefix!)
  for (const route of routes) {
    addServerHandler({ route, handler, lazy: true })
  }
}
