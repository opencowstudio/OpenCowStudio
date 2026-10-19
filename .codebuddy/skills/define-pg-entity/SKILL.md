---
name: define-pg-entity
description: This skill should be used when adding, defining, or modifying a PostgreSQL entity (a database table class) in an OpenCowStudio Nuxt project — that is, any `@PgEntity`-decorated class under an app's `server/entities/` directory. It covers the `@PgEntity` / `@PgKey` / `@PgColumn` decorators of `@opencowstudio/pg-core`, their options and defaults (including the `indexes` option that declares table indexes), and the rules an entity must satisfy to be accepted.
---

# Define a PostgreSQL Entity

## Overview

In OpenCowStudio an entity is a plain TypeScript class decorated with `@PgEntity`,
`@PgKey` and `@PgColumn` from `@opencowstudio/pg-core`. The decorators are **static
markers**: nothing is imported or instantiated when the entity is read.

Because an entity is read from its *source text* rather than constructed, an entity is
only as good as what the source spells out: every option must be a literal or a
locally-declared constant, and every rule below is enforced when the entity is read.

## When This Skill Applies

Use this skill when:

- Adding a new table class, or changing the columns / indexes / table options of an
  existing one under `<app>/server/entities/`.
- An entity does not appear in the build log line `Resolved entity table "<table>"`
  while other entities do.
- A build log contains `Skipping entity "<Name>": ...`.

Do not use this skill for datasource or pool configuration (that is `app.config.yaml`),
and do not use it to implement queries.

## Workflow

1. **Pick the file location.** Create one file per entity under the target app's
   `server/entities/` directory, e.g. `apps/playground/server/entities/user.ts`. The
   default glob is `server/entities/**/*.ts` (Nuxt module option `entityPaths`), so
   nested subdirectories are scanned too. Only files matched by that glob are read; an
   entity class that is merely imported by a scanned file is **not** discovered.
2. **Import the decorators** from the package root: `@opencowstudio/pg-core`. Never
   import from `@opencowstudio/pg-core/builder` in entity files — that subpath is
   build-time only and must not be pulled into an entity.
3. **Declare and export one named class**, decorated with `@PgEntity(...)`. The
   decorator is matched by the *identifier text* `PgEntity`, so never alias the import
   (`import { PgEntity as Entity }` would make the class undiscoverable) and never call
   it through a namespace (`pg.PgEntity(...)`).
4. **Add exactly one `@PgKey` field.** The key's database column is always `id` and the
   decorator has no column option, so name the property `id` too — the runtime expects the
   key property to be `id`. At runtime the key value must be a `string` — `@PgKey`
   installs an initializer that throws for any other type.
5. **Add `@PgColumn` fields.** Every column must declare `columnType`; there is no
   inference from the TypeScript type. Only field declarations are read, so getters,
   methods and constructor parameter properties are ignored.
6. **Declare indexes through `@PgEntity`'s `indexes` option** (there is no `@PgIndex`
   decorator). Each entry is one index definition; index column names are the
   **database column names**, not the property names.
7. **Write only what you need.** Every option except `columnType` (on `@PgColumn`) and
   `columns` (on an `indexes` entry) has a default — see [Option Hygiene](#option-hygiene).
8. **Verify.** Run `pnpm typecheck` from the repo root, then start or build the app and
   confirm the entity appears in the module log output.

Canonical entity file (only non-default options are written):

```ts
import { PgEntity, PgKey, PgColumn } from '@opencowstudio/pg-core'

@PgEntity({
  table: 'users',
  indexes: [{ columns: ['email'], unique: true }],
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

## Option Hygiene

Every option **except** `PgColumnOptions.columnType` and `PgIndexOptions.columns` is
optional **and has a default**. Therefore:

- **Do not set an option unless a different value is explicitly required.** Omit
  `createTableAuto` / `addColumnAuto` / `createIndexAuto` (all default `true`), omit
  `comment`, `table` and `schema` when the default is correct, omit `column` when the
  snake_case property name is correct, and omit `generated` / `unique` unless the value
  must differ from `true` / `false`.
- The result is a minimal entity where every written option carries intent. A written
  `createTableAuto: true`, for example, is noise: it restates the default and makes a
  future change of that default look deliberate.
- When an option **is** required, write the literal value (booleans as real booleans,
  never as strings — see the hard constraints).

```ts
// Bad — restates four defaults.
@PgEntity({ table: 'user_account', schema: 'public', createTableAuto: true, comment: 'Accounts' })

// Good — only the intended deviations.
@PgEntity({
  schema: 'opencow',
  indexes: [{ columns: ['account'], unique: true }],
})
```

## Hard Constraints (enforced at build time)

| Constraint | Consequence when violated |
|---|---|
| Exactly one `@PgKey` per entity | Zero keys, or more than one, throws |
| Every `@PgColumn` declares `columnType` | Missing `columnType` throws |
| `columnType` is one of the seven allowed values | An unknown value throws |
| Decorator argument is an object literal (or the call is bare) | `@PgEntity('users')` throws |
| Every decorator argument is statically evaluable | Function calls, imported constants, template expressions and computed values throw |
| `indexes` is an array of object literals, each with a non-empty `string[]` `columns` | A non-array `indexes`, a non-object entry, or a missing / empty / non-string `columns` throws |
| `dbName` / `schema` / `table` / column names / index columns match `/^[a-zA-Z0-9_]+$/` | Any other identifier throws |
| Boolean options are real `boolean` literals | A string (`'true'` / `'false'` / `'1'` / `'0'`) or any other type throws |

A **missing** table is therefore usually a **validation** problem: a class that violates
any rule above is skipped with `Skipping entity "<Name>": ...` in the build log instead of
failing the build, so read that line before assuming the entity is absent for another
reason.

## Defaults

Only `PgColumnOptions.columnType` and `PgIndexOptions.columns` are required; every other
option has a default and should be omitted unless a different value is required (see
[Option Hygiene](#option-hygiene)).

- `table` → snake_case of the class name (`User` → `user`, `UserAccount` → `user_account`).
- property `column` → snake_case of the property name (`displayName` → `display_name`,
  `userID` → `user_id`, `httpStatusCode` → `http_status_code`).
- key `column` → always `id`; there is no option to change it.
- `schema` → `public`; `dbName` → `default`.
- `comment` → `''`.
- `createTableAuto` / `addColumnAuto` / `createIndexAuto` → `true`.
- `key.generated` → `true`; index `unique` → `false`.

`dbName` must match a key under `databases` in the app's `app.config.yaml`; an unknown
name throws at runtime with `No PostgreSQL datasource configured for dbName "..."`.

## Type Mapping (convention, NOT enforced)

The TypeScript property type is never inspected — `columnType` is authoritative.
The following pairing is the convention used across this repository:

| TypeScript property type | `ColumnType` |
|---|---|
| `string` | `TEXT` |
| `number` (integral) | `BIGINT` |
| `number` (fractional) | `DOUBLE` |
| `boolean` | `BOOLEAN` |
| `Date` | `DATE` |
| object / record | `JSON_OBJECT` |
| array | `JSON_ARRAY` |

## Verification

```bash
pnpm typecheck                       # type-check every workspace package
pnpm --filter @opencowstudio/playground typecheck   # type-check the app entities
pnpm playground:dev                  # then read the log output
```

Start or build the app and confirm the entity is picked up: `Resolved entity table
"<table>"` should appear for it, with no `Skipping entity "<Name>"` line.

## Resources

- `references/decorators-reference.md` — option tables, defaults, literal-evaluation
  rules and exact error messages for the three decorators.
- `references/entity-examples.md` — minimal, standard, indexed, multi-database and
  constant-reference examples plus an anti-pattern list.
