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

// Mock the handler registration: it returns the declared routes (registered
// individually) plus the catch-all fallbacks, all served by one module.
vi.mock('../../src/builder/handlers', () => ({
  registerApiHandlers: vi.fn(() => ({
    routes: [{ route: '/api/users/:id', method: 'GET' }],
    fallbacks: ['/api', '/api/**'],
    handler: '/virtual/api-handler.mjs',
  })),
}))

import { addServerHandler, addServerImports, addServerPlugin } from '@nuxt/kit'
import { registerApiManifest } from '../../src/builder/manifest'
import { registerApiHandlers } from '../../src/builder/handlers'
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

  it('registers the manifest, the plugin, the import, every route and the fallbacks', async () => {
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

    expect(registerApiHandlers).toHaveBeenCalledWith([controller], '/api')
    expect(addServerHandler).toHaveBeenCalledTimes(3)
    expect(addServerHandler).toHaveBeenNthCalledWith(1, {
      route: '/api/users/:id',
      method: 'get',
      handler: '/virtual/api-handler.mjs',
      lazy: true,
    })
    expect(addServerHandler).toHaveBeenNthCalledWith(2, {
      route: '/api',
      handler: '/virtual/api-handler.mjs',
      lazy: true,
    })
    expect(addServerHandler).toHaveBeenNthCalledWith(3, {
      route: '/api/**',
      handler: '/virtual/api-handler.mjs',
      lazy: true,
    })
  })

  it('still answers the prefix when nothing was scanned, so the API answers 404 JSON', async () => {
    vi.mocked(registerApiManifest).mockResolvedValueOnce({ dst: '/virtual/api.manifest.ts', controllers: [] })
    vi.mocked(registerApiHandlers).mockReturnValueOnce({
      routes: [],
      fallbacks: ['/api', '/api/**'],
      handler: '/virtual/api-handler.mjs',
    })

    await setupModule(options, makeNuxt())

    expect(addServerPlugin).toHaveBeenCalled()
    expect(addServerImports).toHaveBeenCalled()
    expect(addServerHandler).toHaveBeenCalledTimes(2)
  })
})
