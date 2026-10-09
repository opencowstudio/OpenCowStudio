import { describe, it, expect, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import type { PgConfigMetadata, PgEntityMetadata } from '@opencowstudio/pg-core'

// The bootstrap plugin depends on the Nitro runtime and the virtual
// `#pg-manifest` / `#pg-entities-manifest` modules that only exist at build
// time. Here we isolate the plugin's logic by mocking those dependencies and
// invoking the handler it registers.

const bootstrapPath = fileURLToPath(
  new URL('../../../src/runtime/plugins/bootstrap', import.meta.url),
)

function mockRuntime(pgConfig: PgConfigMetadata | null, entities: PgEntityMetadata[] = []) {
  // Constructable spy standing in for the real `PgDataSourceManager`.
  const PgDataSourceManagerSpy = vi.fn().mockImplementation(function (
    this: { dbNames: string[] },
    config: PgConfigMetadata,
  ) {
    this.dbNames = Object.keys(config.databases)
  })

  // Constructable spy standing in for the real `PgRepositoryManager`. It records
  // the entities handed to `createRepositories` so the call can be asserted.
  const createRepositories = vi.fn()
  const PgRepositoryManagerSpy = vi.fn().mockImplementation(function (this: {
    createRepositories: (entities: PgEntityMetadata[]) => void
  }) {
    this.createRepositories = createRepositories
  })

  // Each manifest carries its payload as a formatted JSON string.
  const pgConfigJson = pgConfig ? JSON.stringify(pgConfig, null, 2) : null
  const pgEntitiesJson = JSON.stringify(entities)

  vi.doMock('nitropack/runtime', () => ({
    defineNitroPlugin: (handler: () => void) => handler,
  }))
  vi.doMock('@opencowstudio/pg-core', () => ({
    PgDataSourceManager: PgDataSourceManagerSpy,
    PgRepositoryManager: PgRepositoryManagerSpy,
  }))
  vi.doMock('#pg-manifest', () => ({ pgConfigJson }))
  vi.doMock('#pg-entities-manifest', () => ({ pgEntitiesJson }))

  return { PgDataSourceManagerSpy, PgRepositoryManagerSpy, createRepositories }
}

describe('bootstrap nitro plugin', () => {
  it('skips datasource initialization when no pg config is present', async () => {
    vi.resetModules()
    const { PgDataSourceManagerSpy } = mockRuntime(null)
    const mod = await import(bootstrapPath)
    const handler = mod.default as () => void | Promise<void>
    expect(() => handler()).not.toThrow()

    const { PgDataSourceManager } = await import('@opencowstudio/pg-core')
    expect(PgDataSourceManager).toBe(PgDataSourceManagerSpy)
    expect(PgDataSourceManagerSpy).not.toHaveBeenCalled()
  })

  it('initializes a PgDataSourceManager when pg config is present', async () => {
    const cfg: PgConfigMetadata = {
      pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
      databases: {
        default: {
          master: { url: 'postgresql://localhost:5432/db', username: 'u', password: 'p' },
          slaves: [],
        },
      },
    }
    vi.resetModules()
    const { PgDataSourceManagerSpy, PgRepositoryManagerSpy, createRepositories } = mockRuntime(cfg)
    const mod = await import(bootstrapPath)
    const handler = mod.default as () => void | Promise<void>
    await handler()

    const { PgDataSourceManager } = await import('@opencowstudio/pg-core')
    expect(PgDataSourceManager).toBe(PgDataSourceManagerSpy)
    expect(PgDataSourceManagerSpy).toHaveBeenCalledTimes(1)
    // The plugin parses the manifest's JSON string back into the metadata.
    expect(PgDataSourceManagerSpy).toHaveBeenCalledWith(cfg)

    // The repository manager is built from the datasource manager and seeded
    // with the entities parsed from the entity manifest (none here).
    expect(PgRepositoryManagerSpy).toHaveBeenCalledTimes(1)
    expect(PgRepositoryManagerSpy.mock.calls[0]![0]).toBe(PgDataSourceManagerSpy.mock.instances[0])
    expect(createRepositories).toHaveBeenCalledWith([])
  })

  it('resolves ${VAR:default} placeholders from the environment before parsing', async () => {
    const previous = process.env.PG_TEST_PASSWORD
    process.env.PG_TEST_PASSWORD = 'resolved-secret'
    try {
      const cfg: PgConfigMetadata = {
        pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
        databases: {
          default: {
            master: {
              url: 'postgresql://localhost:5432/db',
              username: 'u',
              password: '${PG_TEST_PASSWORD:fallback}',
            },
            slaves: [],
          },
        },
      }
      vi.resetModules()
      const { PgDataSourceManagerSpy } = mockRuntime(cfg)
      const mod = await import(bootstrapPath)
      const handler = mod.default as () => void | Promise<void>
      await handler()

      expect(PgDataSourceManagerSpy).toHaveBeenCalledTimes(1)
      const resolved = PgDataSourceManagerSpy.mock.calls[0]![0] as PgConfigMetadata
      expect(resolved.databases.default.master.password).toBe('resolved-secret')
    } finally {
      if (previous === undefined) {
        delete process.env.PG_TEST_PASSWORD
      } else {
        process.env.PG_TEST_PASSWORD = previous
      }
    }
  })

  it('falls back to the default value when the placeholder variable is unset', async () => {
    const previous = process.env.PG_TEST_PASSWORD
    delete process.env.PG_TEST_PASSWORD
    try {
      const cfg: PgConfigMetadata = {
        pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
        databases: {
          default: {
            master: {
              url: 'postgresql://localhost:5432/db',
              username: 'u',
              password: '${PG_TEST_PASSWORD:fallback-secret}',
            },
            slaves: [],
          },
        },
      }
      vi.resetModules()
      const { PgDataSourceManagerSpy } = mockRuntime(cfg)
      const mod = await import(bootstrapPath)
      const handler = mod.default as () => void | Promise<void>
      await handler()

      expect(PgDataSourceManagerSpy).toHaveBeenCalledTimes(1)
      const resolved = PgDataSourceManagerSpy.mock.calls[0]![0] as PgConfigMetadata
      expect(resolved.databases.default.master.password).toBe('fallback-secret')
    } finally {
      if (previous === undefined) {
        delete process.env.PG_TEST_PASSWORD
      } else {
        process.env.PG_TEST_PASSWORD = previous
      }
    }
  })
})
