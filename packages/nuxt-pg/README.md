# @opencowstudio/nuxt-pg

Nuxt module that integrates [`@opencowstudio/pg-core`](../pg-core) into a Nuxt/Nitro
application.

## What it does

- Scans every `**/entities/*.ts` file in the project for `@PgEntity`-decorated
  classes so their metadata is discovered without manual construction.
- Loads the PostgreSQL datasource config (default `pg.config.yaml` at the
  project root) at build time and injects it into the **server-only** runtime
  config, so credentials never reach the client bundle.
- Registers a Nitro plugin that builds a shared `PgDataSourceManager` from the
  runtime config, available via `usePgDataSourceManager()`.

## Usage

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@opencowstudio/nuxt-pg'],
})
```

```ts
// server/api/users.get.ts
import { usePgDataSourceManager } from '@opencowstudio/nuxt-pg/runtime'

export default defineEventHandler(() => {
  const ds = usePgDataSourceManager().get()
  return ds.query('SELECT 1')
})
```
