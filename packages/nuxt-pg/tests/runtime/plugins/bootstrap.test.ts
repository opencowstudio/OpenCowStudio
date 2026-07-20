import { describe, it, expect, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import type { PgConfigMetadata } from '@opencowstudio/pg-core'

// The bootstrap plugin depends on the Nitro runtime and a virtual `#pg-manifest`
// module that only exist at build time. Here we isolate the plugin's logic by
// mocking those dependencies and invoking the handler it registers.

const bootstrapPath = fileURLToPath(
  new URL('../../../src/runtime/plugins/bootstrap', import.meta.url),
)

function mockRuntime(pgConfig: PgConfigMetadata | null) {
  // Constructable spy standing in for the real `PgDataSourceManager`.
  const PgDataSourceManagerSpy = vi.fn().mockImplementation(function (
    this: { dbNames: string[] },
    config: PgConfigMetadata,
  ) {
    this.dbNames = Object.keys(config.databases)
  })

  // The manifest carries the `pg` namespace as a formatted JSON string.
  const pgConfigJson = pgConfig ? JSON.stringify(pgConfig, null, 2) : null

  vi.doMock('nitropack/runtime', () => ({
    defineNitroPlugin: (handler: () => void) => handler,
  }))
  vi.doMock('@opencowstudio/pg-core', () => ({
    PgDataSourceManager: PgDataSourceManagerSpy,
  }))
  vi.doMock('#pg-manifest', () => ({ pgConfigJson }))

  return PgDataSourceManagerSpy
}

describe('bootstrap nitro plugin', () => {
  it('skips datasource initialization when no pg config is present', async () => {
    vi.resetModules()
    const spy = mockRuntime(null)
    const mod = await import(bootstrapPath)
    const handler = mod.default as () => void
    expect(() => handler()).not.toThrow()

    const { PgDataSourceManager } = await import('@opencowstudio/pg-core')
    expect(PgDataSourceManager).toBe(spy)
    expect(spy).not.toHaveBeenCalled()
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
    const spy = mockRuntime(cfg)
    const mod = await import(bootstrapPath)
    const handler = mod.default as () => void
    handler()

    const { PgDataSourceManager } = await import('@opencowstudio/pg-core')
    expect(PgDataSourceManager).toBe(spy)
    expect(spy).toHaveBeenCalledTimes(1)
    // The plugin parses the manifest's JSON string back into the metadata.
    expect(spy).toHaveBeenCalledWith(cfg)
  })
})
