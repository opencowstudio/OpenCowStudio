/** Sample pg config in YAML form — mirrors `app.config.example.yaml`. */
export const samplePgConfigYaml = `
pg:
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
