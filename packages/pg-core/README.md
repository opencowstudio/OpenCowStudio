# @opencowstudio/pg-core

Framework-agnostic PostgreSQL ORM core for [`opencowstudio`](../../README.md).

This package contains everything that does **not** depend on Nuxt.

## Layout

The source is split by lifecycle stage, and dependencies flow one way only:
`builder/ -> shared/ <- runtime/`.

- `shared/` — the metadata type contract (`types.ts` only; no `typescript`, no
  `pg`).
- `builder/` — the decorator markers + their option types
  (`builder/decorators.ts`) and the build-time parser/resolver
  (`builder/parser.ts`, the only place that imports the TypeScript compiler API);
  exposed as `@opencowstudio/pg-core/builder`.
- `runtime/` — runtime only; the only place that imports `pg`. It also owns the
  entity operation contract.

The runtime entry (`@opencowstudio/pg-core`) re-exports `shared/`, `runtime/` and
exactly one file inside `builder/` (`decorators.ts`, which carries no
`typescript`). It never reaches `builder/parser.ts`, so the compiler API stays
out of the runtime bundle. These rules are enforced by
`tests/architecture.test.ts`.

## What it provides

- `@PgEntity` / `@PgKey` / `@PgColumn` / `@PgIndex` decorators (static markers)
  and their option types (`PgEntityOptions`, `PgKeyOptions`, `PgColumnOptions`,
  `PgIndexOptions`), in `builder/decorators.ts`.
- The shared `PgColumnType` primitive along with the raw/metadata shapes in
  `shared/types.ts`.
- A build-time metadata pipeline (`builder/parser.ts`, exported from
  `@opencowstudio/pg-core/builder`): `parsePgEntity` / `parsePgEntities`
  statically read the decorator *source* via the TypeScript compiler API and
  return fully-resolved `PgEntityMetadata` — identifiers validated, defaults
  applied, boolean options type-checked.
- Typed datasource configuration metadata (`PgConfigMetadata`).
- Connection-pool routing & multi-database registry
  (`runtime/datasource.ts`: `PgDataSource`, `PgDataSourceManager`).
- The entity operation contract (`runtime/repository.ts`):
  `PgEntityRepository<T, K>` with the `insert` / `update` / `delete` /
  `findById` surface, where `K` is the primary-key value type and the key
  property is `id`.

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
