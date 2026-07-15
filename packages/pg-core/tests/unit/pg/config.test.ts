import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadPgConfigFromFile } from '../../../src/pg'

// Exercises the shared example datasource config (packages/pg-core/pg.config.example.yaml)
// so the documented shape is kept valid and in sync with the loader.
const EXAMPLE_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../../pg.config.example.yaml')

describe('pg.config.example.yaml', () => {
  it('should parse into a valid datasource config', () => {
    const config = loadPgConfigFromFile(EXAMPLE_PATH)

    expect(config.pool).toMatchObject({ max: 18, min: 18 })
    expect(Object.keys(config.databases).sort()).toEqual(['default'])
    expect(config.databases.default!.master).toMatchObject({
      url: 'postgresql://localhost:5432/opencowstudio_dev',
      username: 'postgres',
      password: 'postgres',
    })
    expect(config.databases.default!.slaves).toHaveLength(2)
  })
})
