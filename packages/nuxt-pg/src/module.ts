import {
  addServerPlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { registerPgManifest } from './builder/manifest'

const MODULE_NAME = '@opencowstudio/nuxt-pg'

export interface ModuleOptions {
  /**
   * Enable or disable the module
   * @default true
   */
  enabled?: boolean
  /**
   * Path to the PostgreSQL datasource configuration file (YAML). The path is
   * resolved relative to the Nuxt root directory. When the file exists its `pg`
   * namespace is serialized to a JSON string at build time and baked into a
   * server-only manifest, so credentials never reach the client bundle.
   * @default 'app.config.yaml'
   */
  configFile?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: MODULE_NAME,
    configKey: 'pg',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    enabled: true,
    configFile: 'app.config.yaml',
  },
  async setup(options, nuxt) {
    if (!options.enabled) {
      return
    }

    const resolver = createResolver(import.meta.url)

    // Locate, read and serialize the pg config file into a server-only manifest
    // at build time. The runtime parses the JSON string back into metadata.
    registerPgManifest(nuxt, options.configFile!)

    // Register the Nitro plugin that instantiates the datasource manager.
    addServerPlugin(resolver.resolve('./runtime/plugins/bootstrap'))
  },
})
