import { describe, it, expect, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import type { ApiControllerMetadata } from '@opencowstudio/api-core'

// The bootstrap plugin depends on the Nitro runtime and the virtual
// `#api-manifest` module that only exists at build time. Here we isolate the
// plugin's logic by mocking those dependencies and invoking the handler it
// registers.

const bootstrapPath = fileURLToPath(
  new URL('../../../src/runtime/plugins/bootstrap', import.meta.url),
)

const controller: ApiControllerMetadata = {
  className: 'UserController',
  name: 'UserController',
  path: '/',
  description: '',
  modulePath: '/server/apis/user.ts',
  routes: [
    { handler: 'show', methods: ['GET', 'POST'], parameters: [{ name: 'request', source: 'request' }], path: '/users/:id', name: 'UserController.show', description: '' },
  ],
}

class UserController {
  show(context: { params: Record<string, string> }): unknown {
    return { id: context.params.id }
  }
}

/** Mock the Nitro runtime and the build-time manifest for the plugin import. */
function mockRuntime(
  metadata: ApiControllerMetadata[],
  types: Record<string, unknown>,
  schemas: Record<string, unknown> = {},
): void {
  vi.doMock('nitropack/runtime', () => ({
    defineNitroPlugin: (handler: () => void) => handler,
  }))
  vi.doMock('#api-manifest', () => ({
    apiPrefix: '/api',
    apiControllersMetadata: metadata,
    apiControllersTypeMap: types,
    apiSchemas: schemas,
  }))
}

describe('bootstrap nitro plugin', () => {
  it('builds the router from the manifest and injects it', async () => {
    vi.resetModules()
    mockRuntime([controller], { UserController })

    const mod = await import(bootstrapPath)
    const handler = mod.default as () => void
    handler()

    const { useApiRouter } = await import('../../../src/runtime/utils/router')
    const router = useApiRouter()

    expect(router.controllers.map(entry => entry.className)).toEqual(['UserController'])
    expect(router.routes.map(entry => entry.path)).toEqual(['/users/:id'])
    expect(router.match('GET', '/users/42')?.params).toEqual({ id: '42' })
    expect(router.getController('UserController')).toBeInstanceOf(UserController)
  })

  it('still injects the service when nothing was scanned', async () => {
    vi.resetModules()
    mockRuntime([], {})

    const mod = await import(bootstrapPath)
    const handler = mod.default as () => void
    expect(() => handler()).not.toThrow()

    const { useApiRouter } = await import('../../../src/runtime/utils/router')
    expect(useApiRouter().routes).toEqual([])
  })

  it('leaves the service unavailable until the plugin runs', async () => {
    vi.resetModules()
    mockRuntime([], {})

    const { useApiRouter } = await import('../../../src/runtime/utils/router')
    expect(() => useApiRouter()).toThrow(/did not register it/)
  })

  it('injects the request JSON parsed by a schema registered in the manifest', async () => {
    vi.resetModules()

    const schemaController: ApiControllerMetadata = {
      className: 'TodoController',
      name: 'TodoController',
      path: '/',
      description: '',
      modulePath: '/server/apis/todo.ts',
      routes: [
        { handler: 'create', methods: ['POST'], parameters: [{ name: 'input', source: 'input', inputTypeName: 'CreateTodoInput' }], path: '/todos', name: 'TodoController.create', description: '' },
      ],
    }

    class TodoController {
      create(input: unknown): unknown {
        return input
      }
    }

    mockRuntime(
      [schemaController],
      { TodoController },
      { CreateTodoInput: { '~standard': { version: 1, validate: (value: unknown) => ({ value }) } } },
    )

    const mod = await import(bootstrapPath)
    const handler = mod.default as () => void
    handler()

    const { useApiRouter } = await import('../../../src/runtime/utils/router')
    await expect(useApiRouter().dispatch({ method: 'POST', path: '/todos', body: { title: 'hi' } }))
      .resolves.toEqual({ title: 'hi' })
  })

  it('fails startup when a controller class is missing from the manifest', async () => {
    vi.resetModules()
    mockRuntime([controller], {})

    const mod = await import(bootstrapPath)
    const handler = mod.default as () => void
    expect(() => handler()).toThrow(/not present in the controller class map/)
  })
})
