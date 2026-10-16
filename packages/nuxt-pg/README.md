# @opencowstudio/nuxt-pg

Nuxt module that integrates [`@opencowstudio/pg-core`](../pg-core) into a Nuxt/Nitro
application.

## What it does

- Reads the PostgreSQL datasource configuration from a YAML file (the
  `configFile` module option is a file path, defaulting to `app.config.yaml`).
- At build time it extracts the file's `pg` namespace, parses it into a typed
  `PgConfigMetadata` (coercing values such as the string `"18"` to the number
  `18`), logs it, and bakes that metadata into a **server-only** manifest
  (`pg.manifest.ts`), so credentials never reach the client bundle.
- At build time it scans the entity source files (`**/entities/**/*.ts` relative
  to the Nuxt root), resolves every discovered entity class into a
  `PgEntityMetadata` (validated, defaulted and normalised), logs the total number
  of scanned entities and each resolved table, and bakes the collection into a
  **server-only** manifest (`pg.entities.manifest.ts`) as a formatted JSON
  string. The runtime can later parse that string back into entity metadata.
- At runtime a Nitro plugin imports that typed `PgConfigMetadata` directly and,
  when a configuration is present, instantiates a `PgDataSourceManager` from
  `@opencowstudio/pg-core`.

  Because the parsing happens at build time, a value that cannot be coerced
  (for example a pool field authored as the YAML string `abc`) fails the build
  with a detailed error, including the offending config path, the expected type
  and the received value. The only runtime step left is resolving
  `${VAR:default}` placeholders in string values (via
  `runtime/utils/env-placeholder.ts`), so the config can reference runtime
  secrets such as `${DB_PASSWORD}`. A required variable without a default
  (`${DB_PASSWORD}`) logs an error and aborts startup when unset.

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
