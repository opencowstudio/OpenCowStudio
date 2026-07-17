import {
  addServerPlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { loadPgConfigMetadata } from './builder/metadata'
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
   * resolved relative to the Nuxt root directory. When the file exists it is
   * parsed into a `PgConfigMetadata` object at build time and baked into a
   * server-only manifest, so credentials never reach the client bundle.
   * @default 'pg.config.yaml'
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
    configFile: 'pg.config.yaml',
  },
  async setup(options, nuxt) {
    if (!options.enabled) {
      return
    }

    const resolver = createResolver(import.meta.url)

    // Locate, read and parse the pg config file at build time.
    const pgConfig = loadPgConfigMetadata(nuxt.options.rootDir, options.configFile!)

    // Bake the parsed configuration into a server-only manifest.
    registerPgManifest(nuxt, pgConfig)

    // Register the Nitro plugin that instantiates the datasource manager.
    addServerPlugin(resolver.resolve('./runtime/plugins/bootstrap'))
  },
})
