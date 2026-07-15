# @opencowstudio/playground

Nuxt app used for local development and debugging of
[`opencowstudio`](../../README.md).

## Getting started

```bash
# from the repo root
pnpm install
docker compose -f docker/postgres/docker-compose.yml up -d   # start PostgreSQL
pnpm playground:dev
```

The app registers `@opencowstudio/nuxt-pg`, scans `entities/*.ts`, and exposes a small
API at `/api/id/random` that returns a generated id via `@opencowstudio/pg-core`.

Copy `pg.config.yaml` from `pg.config.example.yaml` (in `@opencowstudio/pg-core`) or
edit the one already present to match your database.
