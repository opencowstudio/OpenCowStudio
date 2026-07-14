import { defineNuxtModule, addServerPlugin, createResolver } from '@nuxt/kit'
import { resolve } from 'node:path'
import { scanPgEntities } from './pg'
import { loadPgConfigFromFile } from './pg/config.ts'

export { generateGuid, generateId } from './utils/id'

export interface ModuleOptions {
  /**
   * Enable or disable the module
   * @default true
   */
  enabled?: boolean
  /**
   * Path (relative to the project root) of the PostgreSQL datasource config
   * file. Defaults to "pg.config.yaml" at the project root. When set, the
   * config is loaded at build time and injected into the server-only runtime
   * config so connection pools can be created by the Nitro plugin.
   * @default "pg.config.yaml"
   */
  pgConfigPath?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@opencowstudio/base',
    configKey: 'base',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    enabled: true,
    pgConfigPath: 'pg.config.yaml',
  },
  setup(options, nuxt) {
    if (!options.enabled) {
      return
    }

    // Scan all PostgreSQL entity classes so their @PgEntity metadata is
    // discovered and registered without manual construction.
    const entityFiles = import.meta.glob('/**/entities/*.ts', { eager: true })
    scanPgEntities(Object.values(entityFiles) as Record<string, unknown>[])

    // Load the datasource config (if a path is provided) and expose it to the
    // server runtime only — credentials must never reach the client bundle.
    if (options.pgConfigPath) {
      const configPath = resolve(nuxt.options.rootDir, options.pgConfigPath)
      const pgConfig = loadPgConfigFromFile(configPath)
      nuxt.options.runtimeConfig.pg = pgConfig as unknown as Record<string, unknown>

      const { resolve: resolveRuntime } = createResolver(import.meta.url)
      addServerPlugin(resolveRuntime('./runtime/pg-plugin.ts'))
    }
  },
})
