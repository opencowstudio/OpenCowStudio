# opencowstudio

A PostgreSQL ORM for Nuxt, organised as a pnpm monorepo.

## Packages

| Package | Description |
|---------|-------------|
| [`@opencowstudio/pg-core`](./packages/pg-core) | Framework-agnostic ORM core: decorators, config loading, connection-pool routing and id generation. |
| [`@opencowstudio/nuxt-pg`](./packages/nuxt-pg) | Nuxt module that wires `@opencowstudio/pg-core` into a Nuxt/Nitro app (entity resolution, config injection, server plugin). |

## Apps

| App | Description |
|-----|-------------|
| [`@opencowstudio/playground`](./apps/playground) | Nuxt app used for local development and debugging. |
| [`@opencowstudio/docs`](./apps/docs) | Documentation site (under development). |

## Development

```bash
pnpm install
pnpm playground:dev      # start the playground Nuxt app
pnpm test                # run all package unit tests
pnpm typecheck           # type-check every workspace package
```

A local PostgreSQL instance can be started with `docker compose -f docker/postgres/docker-compose.yml up -d`
(see [`packages/pg-core/pg.config.example.yaml`](./packages/pg-core/pg.config.example.yaml)
and the docs in `apps/docs`).

## License

MIT
