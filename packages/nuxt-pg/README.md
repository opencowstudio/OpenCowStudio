# @opencowstudio/nuxt-pg

Nuxt module that integrates [`@opencowstudio/pg-core`](../pg-core) into a Nuxt/Nitro
application.

## What it does

- Accepts the PostgreSQL datasource configuration as code via the `pgConfig`
  module option (a `PgConfigMetadata` object) and injects it into the
  **server-only** runtime config, so credentials never reach the client bundle.

## Usage

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    ['@opencowstudio/nuxt-pg', {
      pgConfig: {
        pool: { max: 18, min: 18, idleTimeoutMillis: 600000, maxLifetimeSeconds: 1800 },
        databases: {
          default: {
            master: { url: 'postgresql://localhost:5432/opencowstudio_dev', username: 'postgres', password: 'postgres' },
            slaves: [],
          },
        },
      },
    }],
  ],
})
```

```ts
// server/api/users.get.ts
import { PgDataSourceManager } from '@opencowstudio/pg-core'
import type { PgConfigMetadata } from '@opencowstudio/pg-core'

export default defineEventHandler(() => {
  const config = useRuntimeConfig().pg as unknown as PgConfigMetadata
  const ds = new PgDataSourceManager(config).get()
  return ds.query('SELECT 1')
})
```
