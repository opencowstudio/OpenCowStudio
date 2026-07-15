# @opencowstudio/pg-core

Framework-agnostic PostgreSQL ORM core for [`opencowstudio`](../../README.md).

This package contains everything that does **not** depend on Nuxt:

- `@PgEntity` / `@PgKey` / `@PgColumn` decorators and their metadata helpers
  (`getPgEntityMetadata`, `getAllPgEntityMetadata`, `scanPgEntities`).
- Typed YAML datasource configuration loading & validation
  (`loadPgConfigFromFile`, `loadPgConfigFromYaml`, `parsePgUrl`, …).
- Connection-pool routing & multi-database registry
  (`PgDataSource`, `PgDataSourceManager`).
- Id generation utilities (`generateGuid`, `generateId`).

## Usage

```ts
import {
  PgEntity,
  PgKey,
  PgColumn,
  loadPgConfigFromFile,
  PgDataSourceManager,
} from '@opencowstudio/pg-core'

@PgEntity({ table: 'users' })
export class User {
  @PgKey({ generated: false })
  id!: string

  @PgColumn({ columnType: 'TEXT' })
  email!: string
}

const config = loadPgConfigFromFile('pg.config.yaml')
const manager = new PgDataSourceManager(config)
```

For Nuxt integration, use [`@opencowstudio/nuxt-pg`](../nuxt-pg) instead of wiring
this package up manually.

## Config example

See [`pg.config.example.yaml`](./pg.config.example.yaml) for the supported
datasource shape.
