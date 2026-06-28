// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@opencowstudio/base',
  ],

  runtimeConfig: {
    // Private config (server-side only, accessed via useRuntimeConfig())
    appName: '',
    dbHost: '',
    dbPort: '',
    dbName: '',
    dbUser: '',
    dbPassword: '',

    // Public config (client-side, accessed via useRuntimeConfig().public)
    public: {
      apiBase: '',
    },
  },
})
