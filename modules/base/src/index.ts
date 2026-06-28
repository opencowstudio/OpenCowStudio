import { defineNuxtModule, createResolver } from '@nuxt/kit'
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

    const { resolve } = createResolver(import.meta.url)

    // Add runtime plugins, components, composables, etc. here
    // Example: add a runtime plugin
    // nuxt.hook('nitro:config', (nitroConfig) => {
    //   nitroConfig.prerender = nitroConfig.prerender || {}
    //   nitroConfig.prerender.routes = nitroConfig.prerender.routes || []
    //   nitroConfig.prerender.routes.push('/')
    // })
  },
})
