import { defineNuxtModule } from '@nuxt/kit'
import { setupModule } from './builder/setup'

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
  /**
   * Glob patterns that locate the entity source files to scan. Each pattern is
   * resolved relative to the Nuxt root directory. The matched files are
   * collected at build time for downstream entity registration.
   * @default ['server/entities/**\/*.ts']
   */
  entityPaths?: string[]
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
    entityPaths: ['server/entities/**/*.ts'],
  },
  async setup(options, nuxt) {
    await setupModule(options, nuxt)
  },
})
