import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiControllerMetadata, ApiRouteMetadata } from '@opencowstudio/api-core'

// Mock `@nuxt/kit` so the build-time helpers work without a Nuxt instance.
vi.mock('@nuxt/kit', () => ({
  createResolver: vi.fn(() => ({ resolve: (path: string) => `/virtual/${path}` })),
  useLogger: vi.fn(() => ({ info: vi.fn() })),
}))

import { registerApiHandlers } from '../../src/builder/handlers'

/** One controller carrying the routes of the test. */
function controller(routes: ApiRouteMetadata[], className = 'UserController'): ApiControllerMetadata {
  return {
    className,
    name: className,
    path: '/',
    description: '',
    modulePath: `/server/apis/${className}.ts`,
    routes,
  }
}

/** One route declaration, `POST` by default. */
function route(handler: string, path: string, methods: string[] = ['POST']): ApiRouteMetadata {
  return {
    handler,
    methods,
    parameters: [],
    path,
    name: `UserController.${handler}`,
    description: '',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registerApiHandlers', () => {
  it('registers every declared path + method under the mount prefix', () => {
    const { routes } = registerApiHandlers([
      controller([
        route('show', '/users/:id'),
        route('create', '/users', ['POST', 'PUT']),
      ]),
    ], '/api')

    expect(routes).toContainEqual({ route: '/api/users/:id', method: 'POST' })
    expect(routes).toContainEqual({ route: '/api/users', method: 'POST' })
    expect(routes).toContainEqual({ route: '/api/users', method: 'PUT' })
  })

  it('registers one OPTIONS preflight per path, not per method', () => {
    const { routes } = registerApiHandlers([
      controller([
        route('create', '/users', ['POST', 'PUT']),
        route('show', '/users/:id'),
      ]),
    ], '/api')

    const preflights = routes.filter(entry => entry.method === 'OPTIONS')
    expect(preflights).toEqual([
      { route: '/api/users', method: 'OPTIONS' },
      { route: '/api/users/:id', method: 'OPTIONS' },
    ])
  })

  it('normalises the mount prefix', () => {
    const { routes } = registerApiHandlers([controller([route('show', '/users')])], 'api/')
    expect(routes).toContainEqual({ route: '/api/users', method: 'POST' })
  })

  it('points every entry at the same runtime handler module', () => {
    const { handler } = registerApiHandlers([controller([route('show', '/users')])], '/api')
    expect(handler).toBe('/virtual/../runtime/server/api')
  })

  it('registers nothing when no controller was scanned', () => {
    expect(registerApiHandlers([], '/api').routes).toEqual([])
  })
})
