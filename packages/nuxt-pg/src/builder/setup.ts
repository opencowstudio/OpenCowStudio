import { addServerPlugin, createResolver } from '@nuxt/kit'
import type { Nuxt } from 'nuxt/schema'
import type { ModuleOptions } from '../module'
import { registerPgManifest, registerPgEntityManifest } from './manifest'

/**
 * Bootstrap the nuxt-pg module at build time:
 *  1. scan the configured entity paths and bake the entity manifest,
 *  2. read & serialize the pg config file into a server-only manifest,
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

  // Scan the configured entity paths, convert each entity into a PgEntityRaw,
  // and bake the collection into a server-only manifest at build time. The
  // runtime can later parse the JSON string back into entity metadata.
  await registerPgEntityManifest(nuxt, options.entityPaths!)

  // Locate, read and serialize the pg config file into a server-only manifest
  // at build time. The runtime parses the JSON string back into metadata.
  registerPgManifest(nuxt, options.configFile!)

  // Register the Nitro plugin that instantiates the datasource manager.
  addServerPlugin(resolver.resolve('./runtime/plugins/bootstrap'))
}
