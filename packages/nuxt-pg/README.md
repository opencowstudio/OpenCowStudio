# @opencowstudio/nuxt-pg

Nuxt module that integrates [`@opencowstudio/pg-core`](../pg-core) into a Nuxt/Nitro
application.

## What it does

- Reads the PostgreSQL datasource configuration from a YAML file (the
  `configFile` module option is a file path, defaulting to `app.config.yaml`).
- At build time it extracts the file's `pg` namespace as a generic JSON object,
  serializes it to a formatted JSON string, logs it, and bakes that string into a
  **server-only** manifest (`pg.manifest.ts`), so credentials never reach the
  client bundle.
- At build time it scans the configured `entityPaths` (default
  `server/entities/**/*.ts`), converts every discovered entity class into a
  `PgEntityRaw`, logs the total number of scanned entities and each conversion,
  and bakes the collection into a **server-only** manifest
  (`pg.entities.manifest.ts`) as a formatted JSON string. The runtime can later
  parse that string back into entity metadata.
- At runtime a Nitro plugin parses the manifest's JSON string into a
  `PgConfigMetadata` object and, when a configuration is present, instantiates a
  `PgDataSourceManager` from `@opencowstudio/pg-core`.

  The manifest is plain JSON, so values are not guaranteed to match the typed
  metadata — for example a pool field may be authored as the YAML string
  `"18"`. The runtime therefore parses the JSON with a fault-tolerant converter
  (`runtime/utils/pgConfig.ts`) that coerces each value to its target type:
  numeric strings like `"18"` become the number `18`, and unquoted numeric
  credentials like `password: 1234` become strings. When a value cannot be
  coerced, a detailed error (including the offending config path, the expected
  type, and the received value) is logged and the plugin fails loudly.

## Usage

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    ['@opencowstudio/nuxt-pg', {
      // Path resolved relative to the Nuxt root directory.
      configFile: 'app.config.yaml',
    }],
  ],
})
```

```yaml
# app.config.yaml
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
