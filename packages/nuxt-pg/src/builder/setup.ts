import { addServerPlugin, createResolver } from '@nuxt/kit'
import type { Nuxt } from 'nuxt/schema'
import type { ModuleOptions } from '../module'
import { registerPgManifest, registerPgEntityManifest } from './manifest'

/**
 * Bootstrap the nuxt-pg module at build time:
 *  1. scan the entity source files and bake the entity manifest,
 *  2. read & parse the pg config file into a server-only manifest,
 *  3. register the Nitro plugin that instantiates the datasource manager.
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

  // Scan the entity source files, resolve each entity into a PgEntityMetadata,
  // and bake the collection into a server-only manifest at build time. The
  // runtime can later parse the JSON string back into entity metadata.
  //
  // The scanned locations are fixed by the scanner itself: every entity lives
  // in an `entities/` directory below the Nuxt root.
  await registerPgEntityManifest(nuxt)

  // Locate, read and parse the pg config file into a server-only manifest at
  // build time. The runtime imports the typed metadata directly.
  registerPgManifest(nuxt, options.configFile!)

  // Register the Nitro plugin that instantiates the datasource manager.
  addServerPlugin(resolver.resolve('../runtime/plugins/bootstrap'))
}
