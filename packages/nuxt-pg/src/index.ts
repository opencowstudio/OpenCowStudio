import { defineNuxtModule } from '@nuxt/kit'
import { type PgConfigMetadata } from '@opencowstudio/pg-core'

export { generateGuid, generateId } from '@opencowstudio/pg-core'

export interface ModuleOptions {
  /**
   * Enable or disable the module
   * @default true
   */
  enabled?: boolean
  /**
   * PostgreSQL datasource configuration metadata defined in code (a
   * `PgConfigMetadata` object). When provided, it is injected into the
   * server-only runtime config so the application can build connection pools
   * at runtime. Credentials never reach the client bundle.
   */
  pgConfig?: PgConfigMetadata
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@opencowstudio/nuxt-pg',
    configKey: 'base',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    enabled: true,
  },
  async setup(options, nuxt) {
    if (!options.enabled) {
      return
    }

    // Expose the datasource config to the server runtime only — credentials
    // must never reach the client bundle.
    if (options.pgConfig) {
      nuxt.options.runtimeConfig.pg = options.pgConfig as unknown as Record<string, unknown>
    }
  },
})
