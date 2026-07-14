# Local PostgreSQL 18 with Docker

This guide explains how to spin up a local **PostgreSQL 18** instance with Docker
for OpenCowStudio development.

The app does **not** read database credentials from environment variables.
Connection settings live in a single YAML file, `pg.config.yaml` (see
`modules/base/src/index.ts`, which loads it into the server-only
`runtimeConfig.pg`). The snippets below use the project's defaults so the
instance works out of the box:

| Setting            | Default value        |
| ------------------ | -------------------- |
| host               | `localhost`          |
| port               | `5432`               |
| database           | `opencowstudio_dev`  |
| username           | `postgres`           |
| password           | `postgres`           |

## Prerequisites

- Docker Engine (or Docker Desktop) installed and running.
- Verify the install:

  ```bash
  docker --version
  docker info
  ```

## Docker Compose

Create a `docker-compose.yml` (or add the service to an existing one) at the
project root:

```yaml
services:
  postgres:
    image: postgres:18
    container_name: opencowstudio-pg
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: opencowstudio_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql
    restart: unless-stopped

volumes:
  pgdata:
```

Start it with:

```bash
docker compose up -d
```

The named volume `pgdata` persists your data across container recreations.
To stop and remove the container (keeping the data volume):

```bash
docker compose down
```

To also wipe the data volume:

```bash
docker compose down -v
```

## Verify the instance

Check that the container is healthy:

```bash
docker ps --filter "name=opencowstudio-pg"
```

Connect with the `psql` client (either from the container or a local install):

```bash
# From inside the container
docker exec -it opencowstudio-pg psql -U postgres -d opencowstudio_dev

# Or from your host (requires psql installed)
psql "postgresql://postgres:postgres@localhost:5432/opencowstudio_dev"
```

List databases to confirm `opencowstudio_dev` exists:

```sql
\l
```

## Connect the application

Once the instance is running, configure the connection in `pg.config.yaml` at
the project root. The file is git-ignored; create it (or copy from your team's
template) and point the `master` / `slaves` nodes at the running container:

```yaml
pool:
  max: 18
  min: 18
  idleTimeoutMillis: 600000
  maxLifetimeSeconds: 1800
databases:
  default:
    master:
      url: postgresql://localhost:5432/opencowstudio_dev
      username: postgres
      password: postgres
    slaves: []
```

Start the Nuxt app as usual — the `pg` datasource module loads `pg.config.yaml`
at build time and injects it into the server-only runtime config, so the
connection is picked up automatically.

## Common operations

Stop the container:

```bash
docker stop opencowstudio-pg
```

Start it again:

```bash
docker start opencowstudio-pg
```

Remove the container entirely (data in a named volume survives unless `-v` is
used):

```bash
docker rm -f opencowstudio-pg
```

Inspect logs:

```bash
docker logs -f opencowstudio-pg
```

## Troubleshooting

- **Port 5432 already in use** — either stop the local Postgres service
  occupying the port, or map a different host port (e.g. `-p 5433:5432`) and
  update the `url` in `pg.config.yaml` accordingly.
- **Connection refused** — confirm the container is running (`docker ps`) and
  that the host/port in `pg.config.yaml` match the published port.
- **Password authentication failed** — the `POSTGRES_PASSWORD` you set in the
  container must equal the `password` in `pg.config.yaml`.
- **Data not persisting** — make sure you used a volume or a
  bind mount; without one, all data is lost when the container is removed.
