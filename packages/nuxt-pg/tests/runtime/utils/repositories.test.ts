import { describe, it, expect, vi } from 'vitest'

// The service holder lives in the module scope of the runtime util, so every
// test imports a fresh copy of the module to observe the injection from scratch.

const utilPath = '../../../src/runtime/utils/repositories'

describe('injected repository service', () => {
  it('fails when the bootstrap never injected the service', async () => {
    vi.resetModules()
    const { usePgRepositories } = await import(utilPath)

    expect(() => usePgRepositories()).toThrow(/Pg repositories are not available/)
  })

  it('returns the service injected by the bootstrap plugin', async () => {
    vi.resetModules()
    const { setPgRepositories, usePgRepositories } = await import(utilPath)
    const { PgRepositories } = await import('@opencowstudio/pg-core')
    const service = new PgRepositories()

    setPgRepositories(service)

    expect(usePgRepositories()).toBe(service)
  })
})
