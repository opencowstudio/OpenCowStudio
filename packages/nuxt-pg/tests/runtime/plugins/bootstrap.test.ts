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

function mockRuntime(
  pgConfig: PgConfigMetadata | null,
  entities: PgEntityMetadata[] = [],
  entityTypes: Record<string, unknown> = {},
) {
  // Constructable spy standing in for the real `PgDataSourceManager`. It records
  // the `initializeSql` call the plugin makes after construction.
  const initializeSql = vi.fn()
  const PgDataSourceManagerSpy = vi.fn().mockImplementation(function (
    this: { dbNames: string[]; initializeSql: () => Promise<void> },
    config: PgConfigMetadata,
  ) {
    this.dbNames = Object.keys(config.databases)
    this.initializeSql = initializeSql
  })

  // Constructable spy standing in for the real `PgRepositoryManager`. It records
  // the arguments handed to `createRepositories` so the call can be asserted.
  const createRepositories = vi.fn()
  const PgRepositoryManagerSpy = vi.fn().mockImplementation(function (this: {
    createRepositories: (entities: PgEntityMetadata[], typeMap: Record<string, unknown>) => void
  }) {
    this.createRepositories = createRepositories
  })

  // Constructable spy standing in for the injected repository service; the
  // plugin instantiates it once the repositories are registered.
  const PgRepositoriesSpy = vi.fn().mockImplementation(function (this: object) {
    // Stateless service: construction is all the plugin does.
  })

  // Both manifests already carry typed metadata.
  const pgConfigMetadata = pgConfig
  const pgEntitiesMetadata = entities
  const pgEntitiesTypeMap = entityTypes

  vi.doMock('nitropack/runtime', () => ({
    defineNitroPlugin: (handler: () => void) => handler,
  }))
  vi.doMock('@opencowstudio/pg-core', () => ({
    PgDataSourceManager: PgDataSourceManagerSpy,
    PgRepositories: PgRepositoriesSpy,
    PgRepositoryManager: PgRepositoryManagerSpy,
  }))
  vi.doMock('#pg-manifest', () => ({ pgConfigMetadata }))
  vi.doMock('#pg-entities-manifest', () => ({ pgEntitiesMetadata, pgEntitiesTypeMap }))

  return {
    PgDataSourceManagerSpy,
    PgRepositoriesSpy,
    PgRepositoryManagerSpy,
    createRepositories,
    initializeSql,
  }
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

    // Nothing was bootstrapped, so no service was injected.
    const { usePgRepositories } = await import('../../../src/runtime/utils/repositories')
    expect(() => usePgRepositories()).toThrow()
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
    const {
      PgDataSourceManagerSpy,
      PgRepositoriesSpy,
      PgRepositoryManagerSpy,
      createRepositories,
      initializeSql,
    } = mockRuntime(cfg)
    const mod = await import(bootstrapPath)
    const handler = mod.default as () => void | Promise<void>
    await handler()

    const { PgDataSourceManager } = await import('@opencowstudio/pg-core')
    expect(PgDataSourceManager).toBe(PgDataSourceManagerSpy)
    expect(PgDataSourceManagerSpy).toHaveBeenCalledTimes(1)
    // The plugin consumes the manifest's typed metadata directly.
    expect(PgDataSourceManagerSpy).toHaveBeenCalledWith(cfg)
    // The plugin runs the per-database initialization SQL on the manager.
    expect(initializeSql).toHaveBeenCalledTimes(1)

    // The repository manager is built from the datasource manager and seeded
    // with the entities and the entity class map from the entity manifest.
    expect(PgRepositoryManagerSpy).toHaveBeenCalledTimes(1)
    expect(PgRepositoryManagerSpy.mock.calls[0]![0]).toBe(PgDataSourceManagerSpy.mock.instances[0])
    expect(createRepositories).toHaveBeenCalledWith([], {})

    // The repository service is injected once the repositories are registered.
    expect(PgRepositoriesSpy).toHaveBeenCalledTimes(1)
    const { usePgRepositories } = await import('../../../src/runtime/utils/repositories')
    expect(usePgRepositories()).toBe(PgRepositoriesSpy.mock.instances[0])
  })

  it('hands the entity metadata and the entity type map to createRepositories', async () => {
    const cfg: PgConfigMetadata = {
      pool: { max: 1, min: 1, idleTimeoutMillis: 1, maxLifetimeSeconds: 1 },
      databases: {
        default: {
          master: { url: 'postgresql://localhost:5432/db', username: 'u', password: 'p' },
          slaves: [],
        },
      },
    }
    const entities = [{ className: 'User' } as PgEntityMetadata]
    const entityTypes = { User: class User {} }

    vi.resetModules()
    const { createRepositories } = mockRuntime(cfg, entities, entityTypes)
    const mod = await import(bootstrapPath)
    const handler = mod.default as () => void | Promise<void>
    await handler()

    expect(createRepositories).toHaveBeenCalledWith(entities, entityTypes)
  })

  it('resolves ${VAR:default} placeholders from the environment', async () => {
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
