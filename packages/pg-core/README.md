# @opencowstudio/pg-core

Framework-agnostic PostgreSQL ORM core for [`opencowstudio`](../../README.md).

This package contains everything that does **not** depend on Nuxt:

- `@PgEntity` / `@PgKey` / `@PgColumn` decorators and their metadata helper
  (`resolvePgEntities`), which re-parses entity metadata on every call.
- Typed datasource configuration metadata (`PgConfigMetadata`).
- Connection-pool routing & multi-database registry
  (`PgDataSource`, `PgDataSourceManager`).

Id-generation utilities (`generateGuid`, `generateId`) are re-exported from
[`@opencowstudio/core`](../core) so they can be shared across packages.

## Usage

```ts
import {
  PgEntity,
  PgKey,
  PgColumn,
  PgDataSourceManager,
  type PgConfigMetadata,
} from '@opencowstudio/pg-core'

@PgEntity({ table: 'users' })
export class User {
  @PgKey({ generated: false })
  id!: string

  @PgColumn({ columnType: 'TEXT' })
  email!: string
}

const config: PgConfigMetadata = {
  pool: { max: 18, min: 18, idleTimeoutMillis: 600000, maxLifetimeSeconds: 1800 },
  databases: {
    default: {
      master: { url: 'postgresql://localhost:5432/opencowstudio_dev', username: 'postgres', password: 'postgres' },
      slaves: [],
    },
  },
}
const manager = new PgDataSourceManager(config)
```

For Nuxt integration, use [`@opencowstudio/nuxt-pg`](../nuxt-pg) instead of wiring
this package up manually.

## Config example

See [`pg.config.example.yaml`](./pg.config.example.yaml) for the supported
datasource shape (defined in code as `PgConfigMetadata`).
