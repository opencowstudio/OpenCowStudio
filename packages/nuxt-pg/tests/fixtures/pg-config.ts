import type { PgConfigMetadata } from '@opencowstudio/pg-core'

/** Sample pg config in YAML form — mirrors `pg.config.example.yaml`. */
export const samplePgConfigYaml = `
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
`

/** The same sample config as a typed `PgConfigMetadata` object. */
export const samplePgConfig: PgConfigMetadata = {
  pool: {
    max: 18,
    min: 18,
    idleTimeoutMillis: 600000,
    maxLifetimeSeconds: 1800,
  },
  databases: {
    default: {
      master: {
        url: 'postgresql://localhost:5432/opencowstudio_dev',
        username: 'postgres',
        password: 'postgres',
      },
      slaves: [],
    },
  },
}
