import { defineNuxtModule } from '@nuxt/kit'
import { scanPgEntities } from './pg'
export { generateGuid, generateId } from './utils/id'

export interface ModuleOptions {
  /**
   * Enable or disable the module
   * @default true
   */
  enabled?: boolean
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
  },
  setup(options, nuxt) {
    if (!options.enabled) {
      return
    }

    // Scan all PostgreSQL entity classes so their @PgEntity metadata is
    // discovered and registered without manual construction.
    const entityFiles = import.meta.glob('/**/entities/*.ts', { eager: true })
    scanPgEntities(Object.values(entityFiles) as Record<string, unknown>[])
  },
})
