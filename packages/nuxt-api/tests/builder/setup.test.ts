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
    { handler: 'show', methods: ['GET'], injectsContext: true, path: '/users/:id', name: 'UserController.show', description: '' },
  ],
}

// Mock the manifest builder so the test focuses on the orchestration inside
// `setupModule` rather than the (already tested) manifest generation.
vi.mock('../../src/builder/manifest', () => ({
  registerApiManifest: vi.fn(async () => ({ dst: '/virtual/api.manifest.ts', controllers: [controller] })),
}))

// Mock the handler generator: it writes templates and returns one registration
// per route, which `setupModule` forwards to `addServerHandler`.
vi.mock('../../src/builder/handlers', () => ({
  registerApiHandlers: vi.fn(() => [
    { route: '/api/users/:id', method: 'GET', handler: '/virtual/api-handlers/GET.mjs' },
    { route: '/api/users/:id', method: 'POST', handler: '/virtual/api-handlers/POST.mjs' },
  ]),
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

  it('registers the manifest, the plugin, the import and every route handler', async () => {
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

    expect(registerApiHandlers).toHaveBeenCalledWith(nuxt, [controller], '/api')
    expect(addServerHandler).toHaveBeenCalledTimes(2)
    expect(addServerHandler).toHaveBeenNthCalledWith(1, {
      route: '/api/users/:id',
      method: 'get',
      handler: '/virtual/api-handlers/GET.mjs',
      lazy: true,
    })
    expect(addServerHandler).toHaveBeenNthCalledWith(2, {
      route: '/api/users/:id',
      method: 'post',
      handler: '/virtual/api-handlers/POST.mjs',
      lazy: true,
    })
  })

  it('still registers the plugin and the import when nothing was scanned', async () => {
    vi.mocked(registerApiManifest).mockResolvedValueOnce({ dst: '/virtual/api.manifest.ts', controllers: [] })
    vi.mocked(registerApiHandlers).mockReturnValueOnce([])

    await setupModule(options, makeNuxt())

    expect(addServerPlugin).toHaveBeenCalled()
    expect(addServerImports).toHaveBeenCalled()
    expect(addServerHandler).not.toHaveBeenCalled()
  })
})
