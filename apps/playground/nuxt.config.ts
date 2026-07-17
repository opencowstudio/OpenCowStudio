// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    ['@opencowstudio/nuxt-pg', {
      // Path resolved relative to the Nuxt root directory.
      configFile: 'pg.config.yaml',
    }],
  ],

  runtimeConfig: {
    // Private config (server-side only, accessed via useRuntimeConfig())
    appName: '',

    // Public config (client-side, accessed via useRuntimeConfig().public)
    public: {
      apiBase: '',
    },
  },
})
