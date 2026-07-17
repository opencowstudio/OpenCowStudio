# @opencowstudio/nuxt-pg

Nuxt module that integrates [`@opencowstudio/pg-core`](../pg-core) into a Nuxt/Nitro
application.

## What it does

- Reads the PostgreSQL datasource configuration from a YAML file (the
  `configFile` module option is a file path, defaulting to `pg.config.yaml`).
- At build time it parses the file into a `PgConfigMetadata` object and bakes it
  into a **server-only** manifest (`pg.manifest.ts`), so credentials never reach
  the client bundle.
- At runtime a Nitro plugin reads the manifest and, when a configuration is
  present, instantiates a `PgDataSourceManager` from `@opencowstudio/pg-core`.

## Usage

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    ['@opencowstudio/nuxt-pg', {
      // Path resolved relative to the Nuxt root directory.
      configFile: 'pg.config.yaml',
    }],
  ],
})
```

```yaml
# pg.config.yaml
pool:
  max: 18
  min: 18
  idleTimeoutMillis: 600000
  maxLifetimeSeconds: 1800
databases:
  default:
    master:
      url: postgresql://localhost:5432/opencowstudio_dev
      username: postgres
      password: postgres
    slaves: []
```
