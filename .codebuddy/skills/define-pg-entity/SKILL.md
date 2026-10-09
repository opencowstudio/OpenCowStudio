---
name: define-pg-entity
description: This skill should be used when adding, defining, or modifying a PostgreSQL entity (a database table class) in an OpenCowStudio Nuxt project — that is, any `@PgEntity`-decorated class under an app's `server/entities/` directory. It covers the `@PgEntity` / `@PgKey` / `@PgColumn` / `@PgIndex` decorators of `@opencowstudio/pg-core`, their options and defaults, the static rules enforced by the build-time parser, and how the `@opencowstudio/nuxt-pg` module discovers entities at build time.
---

# Define a PostgreSQL Entity

## Overview

In OpenCowStudio an entity is a plain TypeScript class decorated with `@PgEntity`
markers from `@opencowstudio/pg-core`. The decorators are **static markers**: nothing
is imported or instantiated at scan time. The `@opencowstudio/nuxt-pg` module globs the
entity source files at build time and reads the decorator *source* through the
TypeScript compiler API (`parsePgEntities` in `pg-core/builder/parser.ts`) to produce a
validated, defaulted `PgEntityMetadata` collection, which is baked into a server-only
manifest and registered at runtime by a Nitro plugin.

Because resolution is static, an entity is only as good as what the parser can read
from the source text. Every rule below is enforced by that parse pass.

## When This Skill Applies

Use this skill when:

- Adding a new table class, or changing the columns / indexes / table options of an
  existing one under `<app>/server/entities/`.
- An entity does not appear in the build log line `Resolved entity table "<table>"`
  while other entities do.
- A build log contains `Skipping entity "<Name>": ...`.

Do not use this skill for datasource or pool configuration (that is `app.config.yaml`
and `PgConfigMetadata`), and do not use it to implement CRUD queries (repository
creation in `PgRepositoryManager.createRepositories` is not implemented yet — the
manager currently only ensures each entity's schema exists).

## Workflow

1. **Pick the file location.** Create one file per entity under the target app's
   `server/entities/` directory, e.g. `apps/playground/server/entities/user.ts`. The
   default glob is `server/entities/**/*.ts` (Nuxt module option `entityPaths`), so
   nested subdirectories are scanned too. Only files matched by that glob are scanned;
   an entity class that is merely imported by a scanned file is **not** discovered,
   because the parser only walks the root files it was given.
2. **Import the decorators** from the package root: `@opencowstudio/pg-core`. Never
   import from `@opencowstudio/pg-core/builder` in entity files — that subpath pulls in
   the TypeScript compiler API and is build-time only.
3. **Declare and export one named class**, decorated with `@PgEntity(...)`. The parser
   matches the decorator by the *identifier text* `PgEntity`, so never alias the import
   (`import { PgEntity as Entity }` would make the class undiscoverable) and never call
   it through a namespace (`pg.PgEntity(...)`).
4. **Add exactly one `@PgKey` field.** The key's database column is always `id` and the
   decorator has no column option, so name the property `id` too — the runtime repository
   contract (`PgEntityRepository`) is fixed to the `id` property. At runtime the key value
   must be a `string` — `@PgKey` installs an initializer that throws for any other type.
5. **Add `@PgColumn` fields.** Every column must declare `columnType`; there is no
   inference from the TypeScript type. Only `PropertyDeclaration` members are read, so
   getters, methods and constructor parameter properties are ignored.
6. **Add zero or more `@PgIndex(...)` decorators** on the class (repeatable). Index
   column names are the **database column names**, not the property names.
7. **Write only what you need.** Every option except `columnType` (on `@PgColumn`) and
   `columns` (on `@PgIndex`) has a default — see [Option Hygiene](#option-hygiene).
8. **Verify.** Run `pnpm typecheck` from the repo root, then start or build the app and
   confirm the entity appears in the module log output.

Canonical entity file (only non-default options are written):

```ts
import { PgEntity, PgKey, PgColumn, PgIndex } from '@opencowstudio/pg-core'

@PgEntity({ table: 'users' })
@PgIndex({ columns: ['email'], unique: true })
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
@PgEntity({ schema: 'opencow' })
@PgIndex({ columns: ['account'], unique: true })
```

## Hard Constraints (enforced at build time)

| Constraint | Consequence when violated |
|---|---|
| Exactly one `@PgKey` per entity | Zero keys, or more than one, throws |
| Every `@PgColumn` declares `columnType` | Missing `columnType` throws |
| `columnType` is one of the seven allowed values | An unknown value throws |
| Decorator argument is an object literal (or the call is bare) | `@PgEntity('users')` throws |
| Every decorator argument is statically evaluable | Function calls, imported constants, template expressions and computed values throw |
| `dbName` / `schema` / `table` / column names / index columns match `/^[a-zA-Z0-9_]+$/` | Any other identifier throws |
| Boolean options are real `boolean` literals | A string (`'true'` / `'false'` / `'1'` / `'0'`) or any other type throws |

The static parser is also the reason a **missing** table is usually a **validation**
problem: `nuxt-pg` calls `parsePgEntities(files, { skipInvalid: true })`, so a class that
fails any rule above is skipped with a warning instead of failing the build. Always read
the build log for `Skipping entity ...` lines before assuming the entity is absent for
another reason.

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

The parser never inspects the TypeScript property type — `columnType` is authoritative.
The following pairing is the convention used across this repository:

| TypeScript property type | `PgColumnType` |
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
pnpm playground:dev                  # then read the nuxt-pg log output
```

Expected log lines at build/startup: `Scanned <n> entity file(s) from entity paths`,
`Resolved entity table "<table>"` per entity, and
`PgRepositoryManager initialized (entities: <n>)` at runtime.

## Resources

- `references/decorators-reference.md` — full option tables, literal-evaluation rules,
  the resolution pipeline, resolved metadata shape, and exact error messages.
- `references/entity-examples.md` — minimal, standard, indexed, multi-database and
  constant-reference examples plus an anti-pattern list.
