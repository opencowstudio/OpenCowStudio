import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Nuxt } from 'nuxt/schema'

// Mock `@nuxt/kit` so the build-time helpers (`createResolver`,
// `addServerPlugin`) don't require a real Nuxt instance.
vi.mock('@nuxt/kit', () => ({
  createResolver: vi.fn(() => ({ resolve: (p: string) => p })),
  addServerPlugin: vi.fn(),
}))

// Mock the manifest builders so the test focuses on the orchestration inside
// `setupModule` rather than the (already tested) manifest generation.
vi.mock('../../src/builder/manifest', () => ({
  registerPgManifest: vi.fn(),
  registerPgEntityManifest: vi.fn(async () => '/virtual/pg.entities.manifest.ts'),
}))

import { addServerPlugin } from '@nuxt/kit'
import { registerPgManifest, registerPgEntityManifest } from '../../src/builder/manifest'
import { setupModule } from '../../src/builder/setup'

function makeNuxt(): Nuxt {
  return { options: { alias: {}, rootDir: '/tmp' } } as unknown as Nuxt
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('setupModule', () => {
  it('skips all registration when the module is disabled', async () => {
    const nuxt = makeNuxt()
    await setupModule({ enabled: false }, nuxt)
    expect(registerPgEntityManifest).not.toHaveBeenCalled()
    expect(registerPgManifest).not.toHaveBeenCalled()
    expect(addServerPlugin).not.toHaveBeenCalled()
  })

  it('registers manifests and the server plugin when enabled', async () => {
    const nuxt = makeNuxt()
    const options = {
      enabled: true,
      configFile: 'app.config.yaml',
      entityPaths: ['server/entities/**/*.ts'],
    }
    await setupModule(options, nuxt)

    expect(registerPgEntityManifest).toHaveBeenCalledWith(nuxt, [
      'server/entities/**/*.ts',
    ])
    expect(registerPgManifest).toHaveBeenCalledWith(nuxt, 'app.config.yaml')
    expect(addServerPlugin).toHaveBeenCalledWith(
      './runtime/plugins/bootstrap',
    )
  })
})
