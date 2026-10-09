# Entity Examples

## Minimal entity (all defaults)

Defaults apply: table `profile`, schema `public`, dbName `default`, `id` column as key
with `generated: true`, all three `*Auto` flags `true`.

```ts
import { PgEntity, PgKey, PgColumn } from '@opencowstudio/pg-core'

@PgEntity()
export class Profile {
  @PgKey()
  id!: string

  @PgColumn({ columnType: 'TEXT' })
  displayName!: string
}
```

## Standard entity with an explicit table name and indexes

Only the options that differ from the defaults are written.

```ts
import { PgEntity, PgKey, PgColumn } from '@opencowstudio/pg-core'

@PgEntity({
  table: 'users',
  indexes: [
    { columns: ['email'], unique: true },
    { columns: ['display_name', 'created_at'] },
  ],
})
export class User {
  @PgKey()
  id!: string

  @PgColumn({ columnType: 'TEXT' })
  email!: string

  @PgColumn({ columnType: 'TEXT' })
  displayName!: string

  @PgColumn({ columnType: 'DATE' })
  createdAt!: Date
}
```

Index `columns` use database column names. Because `displayName` resolves to
`display_name`, the composite index above refers to `display_name`, not `displayName`.

## Explicit column name on a regular column

The key column is always `id` and cannot be configured, but a `@PgColumn` may override
its default snake_case column name.

```ts
import { PgEntity, PgKey, PgColumn } from '@opencowstudio/pg-core'

@PgEntity({ table: 'members' })
export class Member {
  @PgKey()
  id!: string

  @PgColumn({ column: 'full_name', columnType: 'TEXT' })
  name!: string

  @PgColumn({ columnType: 'DATE' })
  bornAt!: Date
}
```

## Explicitly overriding a boolean option

Boolean options are plain `boolean` values — string forms are rejected. Write one only
when the value must differ from its default.

```ts
import { PgEntity, PgKey, PgColumn } from '@opencowstudio/pg-core'

@PgEntity({
  table: 'audit_logs',
  createTableAuto: false,
  indexes: [{ columns: ['actor_id', 'created_at'] }],
})
export class AuditLog {
  @PgKey()
  id!: string

  @PgColumn({ columnType: 'JSON_OBJECT' })
  payload!: Record<string, unknown>
}
```

## Multi-database entity

`dbName` must exist as a key under `databases` in `app.config.yaml`.

```ts
import { PgEntity, PgKey, PgColumn } from '@opencowstudio/pg-core'

@PgEntity({ dbName: 'analytics', schema: 'reporting', table: 'events' })
export class AnalyticsEvent {
  @PgKey()
  id!: string

  @PgColumn({ columnType: 'JSON_ARRAY' })
  tags!: string[]

  @PgColumn({ columnType: 'DOUBLE' })
  score!: number
}
```

## Constant-driven options

A top-level constant declared in the same file may be referenced from a decorator.

```ts
import { PgEntity, PgKey } from '@opencowstudio/pg-core'

const SCHEMA = 'tenant'

@PgEntity({ schema: SCHEMA })
export class TenantSetting {
  @PgKey() id!: string
}
```

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| `@PgEntity()` on a class without `@PgKey` | `declares no @PgKey field` — the parser throws |
| Two `@PgKey` properties | `declares multiple @PgKey fields` — the parser throws |
| `@PgColumn()` without `columnType` | `Missing required columnType` |
| `@PgColumn({ columnType: 'VARCHAR' })` | Unknown logical type — use `TEXT` |
| `@PgEntity('users')` | Argument must be an object literal |
| `import { PgEntity as Entity } from '@opencowstudio/pg-core'` | Decorator matched by the identifier text `PgEntity`; an aliased decorator is invisible to the scanner |
| `import { SCHEMA } from './constants'` used in a decorator | Cross-file identifiers cannot be resolved; declare the constant in the entity file |
| `@PgEntity({ table: buildTableName() })` | Function calls are not statically evaluable |
| `@PgEntity({ table: 'user-table' })` | Identifier validation rejects `-` (and any non `[a-zA-Z0-9_]` character) |
| `@PgEntity({ createTableAuto: 'true' })` | Boolean options must be real booleans; strings are rejected |
| `@PgKey({ column: 'member_id' })` | `@PgKey` has no `column` option — the key column is always `id` |
| `@PgIndex({ columns: ['email'] })` | There is no `@PgIndex` decorator; declare indexes through `@PgEntity({ indexes: [...] })` |
| `@PgEntity({ indexes: { columns: ['email'] } })` | `indexes` must be an array of index definitions |
| `@PgEntity({ indexes: [{ columns: [] }] })` | Each index needs a non-empty `columns` array |
| `@PgEntity({ schema: 'public', createTableAuto: true })` | Restates defaults; write only options whose value differs from the default |
| `@PgKey() id!: number` | Parses, but the runtime key guard throws for non-string key values |
| Entity class under `server/models/` | Only `server/entities/**/*.ts` is scanned by default |
| Importing an entity into another entity file and expecting discovery | Only files matched by `entityPaths` are scanned |
| Importing `@opencowstudio/pg-core/builder` in an entity file | Build-time-only entry point that pulls in the TypeScript compiler API |
| Importing an entity from client code | Entity metadata is server-only; keep entities out of client bundles |
