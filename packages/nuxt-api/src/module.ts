import { defineNuxtModule } from '@nuxt/kit'
import { setupModule } from './builder/setup'

const MODULE_NAME = '@opencowstudio/nuxt-api'

export interface ModuleOptions {
  /**
   * Enable or disable the module
   * @default true
   */
  enabled?: boolean
  /**
   * Directory holding the API controller source files, resolved relative to the
   * Nuxt root directory. Every `.ts` file below it is scanned at build time for
   * `@ApiController` classes.
   *
   * This is deliberately separate from Nitro's `server/api` directory: those
   * files are file-based route handlers, while these declare controller classes.
   * @default 'server/apis'
   */
  dir?: string
  /**
   * URL prefix prepended to every controller route when it is registered on the
   * Nitro router. The default matches Nitro's own `server/api` prefix, so
   * controller routes look like file-based ones.
   * @default '/api'
   */
  prefix?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: MODULE_NAME,
    configKey: 'api',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    enabled: true,
    dir: 'server/apis',
    prefix: '/api',
  },
  async setup(options, nuxt) {
    await setupModule(options, nuxt)
  },
})
