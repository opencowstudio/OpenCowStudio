import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Nuxt } from 'nuxt/schema'
import type { ApiControllerMetadata } from '@opencowstudio/api-core'

// Mock `@nuxt/kit` so the build-time helpers (`createResolver`,
// `addServerPlugin`, `addServerImports`, `addServerHandler`) don't require a
// real Nuxt instance.
vi.mock('@nuxt/kit', () => ({
  createResolver: vi.fn(() => ({ resolve: (p: string) => p })),
  addServerPlugin: vi.fn(),
  addServerImports: vi.fn(),
  addServerHandler: vi.fn(),
}))

const controller: ApiControllerMetadata = {
  className: 'UserController',
  name: 'UserController',
  path: '/',
  description: '',
  modulePath: '/server/apis/user.ts',
  routes: [
    { handler: 'show', methods: ['GET'], parameters: [{ name: 'context', source: 'context' }], path: '/users/:id', name: 'UserController.show', description: '' },
  ],
}

// Mock the manifest builder so the test focuses on the orchestration inside
// `setupModule` rather than the (already tested) manifest generation.
vi.mock('../../src/builder/manifest', () => ({
  registerApiManifest: vi.fn(async () => ({ dst: '/virtual/api.manifest.ts', controllers: [controller] })),
}))

// Mock the handler registration: it returns the catch-all patterns plus the
// runtime handler module that `setupModule` forwards to `addServerHandler`.
vi.mock('../../src/builder/handlers', () => ({
  registerApiHandler: vi.fn(() => ({
    routes: ['/api', '/api/**'],
    handler: '/virtual/api-handler.mjs',
    count: 1,
  })),
}))

import { addServerHandler, addServerImports, addServerPlugin } from '@nuxt/kit'
import { registerApiManifest } from '../../src/builder/manifest'
import { registerApiHandler } from '../../src/builder/handlers'
import { setupModule } from '../../src/builder/setup'

function makeNuxt(): Nuxt {
  return { options: { alias: {}, rootDir: '/tmp' } } as unknown as Nuxt
}

/** The full set of options `defineNuxtModule` would hand to `setupModule`. */
const options = {
  enabled: true,
  dir: 'server/apis',
  prefix: '/api',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('setupModule', () => {
  it('skips all registration when the module is disabled', async () => {
    await setupModule({ ...options, enabled: false }, makeNuxt())

    expect(registerApiManifest).not.toHaveBeenCalled()
    expect(addServerPlugin).not.toHaveBeenCalled()
    expect(addServerImports).not.toHaveBeenCalled()
    expect(addServerHandler).not.toHaveBeenCalled()
  })

  it('registers the manifest, the plugin, the import and the catch-all handler', async () => {
    const nuxt = makeNuxt()
    await setupModule(options, nuxt)

    expect(registerApiManifest).toHaveBeenCalledWith(nuxt, 'server/apis', '/api')
    expect(addServerPlugin).toHaveBeenCalledWith('../runtime/plugins/bootstrap')
    expect(addServerImports).toHaveBeenCalledWith([
      {
        name: 'useApiRouter',
        from: '../runtime/utils/router',
      },
    ])

    expect(registerApiHandler).toHaveBeenCalledWith([controller], '/api')
    expect(addServerHandler).toHaveBeenCalledTimes(2)
    expect(addServerHandler).toHaveBeenNthCalledWith(1, {
      route: '/api',
      handler: '/virtual/api-handler.mjs',
      lazy: true,
    })
    expect(addServerHandler).toHaveBeenNthCalledWith(2, {
      route: '/api/**',
      handler: '/virtual/api-handler.mjs',
      lazy: true,
    })
  })

  it('still serves the prefix when nothing was scanned, so it answers 404 JSON', async () => {
    vi.mocked(registerApiManifest).mockResolvedValueOnce({ dst: '/virtual/api.manifest.ts', controllers: [] })

    await setupModule(options, makeNuxt())

    expect(addServerPlugin).toHaveBeenCalled()
    expect(addServerImports).toHaveBeenCalled()
    expect(addServerHandler).toHaveBeenCalledTimes(2)
  })
})
