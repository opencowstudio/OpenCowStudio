import { describe, it, expect, vi } from 'vitest'
import { ApiRouter, compileApiPath } from '../../src/index.ts'
import type { ApiControllerMetadata, ApiRequestContext, ApiRouteMetadata } from '../../src/index.ts'

function controller(overrides: Partial<ApiControllerMetadata> = {}): ApiControllerMetadata {
  return {
    className: 'UserController',
    name: 'UserController',
    path: '/',
    description: '',
    modulePath: '/server/apis/user.ts',
    routes: [],
    ...overrides,
  }
}

function route(
  handler: string,
  path: string,
  name = `UserController.${handler}`,
  injectsContext = true,
): ApiRouteMetadata {
  return { handler, methods: ['GET', 'POST'], injectsContext, path, name, description: '' }
}

const controllers: ApiControllerMetadata[] = [
  controller({
    routes: [
      route('show', '/users/:id'),
      route('me', '/users/me', 'UserController.me', false),
      route('create', '/users'),
    ],
  }),
]

class UserController {
  show(context: ApiRequestContext): unknown {
    return { id: context.params.id }
  }

  me(): unknown {
    return 'me'
  }

  create(context: ApiRequestContext): unknown {
    return { created: context.body }
  }
}

const classMap = { UserController }

describe('compileApiPath', () => {
  it('compiles static segments only', () => {
    const { pattern, keys } = compileApiPath('/users/me')
    expect(keys).toEqual([])
    expect(pattern.test('/users/me')).toBe(true)
    expect(pattern.test('/users/me/extra')).toBe(false)
  })

  it('captures every :name segment', () => {
    const { pattern, keys } = compileApiPath('/users/:id/posts/:postId')
    expect(keys).toEqual(['id', 'postId'])
    expect(pattern.exec('/users/42/posts/7')?.slice(1)).toEqual(['42', '7'])
  })

  it('matches the root path', () => {
    expect(compileApiPath('/').pattern.test('/')).toBe(true)
  })
})

describe('ApiRouter — construction', () => {
  it('compiles every declared route', () => {
    const router = new ApiRouter(controllers, classMap)
    expect(router.routes.map(entry => entry.path)).toEqual(['/users/me', '/users', '/users/:id'])
    expect(router.controllers.map(entry => entry.className)).toEqual(['UserController'])
  })

  it('instantiates the controllers and exposes them by class name', () => {
    const router = new ApiRouter(controllers, classMap)
    expect(router.getController('UserController')).toBeInstanceOf(UserController)
  })

  it('throws for an unknown controller class name', () => {
    const router = new ApiRouter(controllers, classMap)
    expect(() => router.getController('MissingController')).toThrow(/not registered/)
  })

  it('throws when the controller class is missing from the class map', () => {
    expect(() => new ApiRouter(controllers, {})).toThrow(/not present in the controller class map/)
  })

  it('throws when a route points at a missing method', () => {
    class EmptyController {}
    expect(
      () => new ApiRouter(controllers, { UserController: EmptyController }),
    ).toThrow(/which is not a method/)
  })

  it('throws on a duplicate path', () => {
    const duplicated: ApiControllerMetadata[] = [
      controller({ routes: [route('me', '/users/me')] }),
      controller({
        className: 'OtherController',
        name: 'OtherController',
        routes: [route('me', '/users/me')],
      }),
    ]
    const classes = { UserController, OtherController: UserController }
    expect(() => new ApiRouter(duplicated, classes)).toThrow(/Duplicate route "GET \/users\/me"/)
  })

  it('throws when a controller is registered twice', () => {
    const duplicated: ApiControllerMetadata[] = [controller(), controller()]
    expect(() => new ApiRouter(duplicated, classMap)).toThrow(/declared more than once/)
  })
})

describe('ApiRouter — matching', () => {
  const router = new ApiRouter(controllers, classMap)

  it('matches a parameterised route and captures its parameters', () => {
    const match = router.match('GET', '/users/42')
    expect(match?.route.name).toBe('UserController.show')
    expect(match?.params).toEqual({ id: '42' })
  })

  it('answers both POST and GET', () => {
    expect(router.match('GET', '/users/me')?.route.name).toBe('UserController.me')
    expect(router.match('POST', '/users/me')?.route.name).toBe('UserController.me')
  })

  it('rejects every other method', () => {
    expect(router.match('PUT', '/users/me')).toBeNull()
    expect(router.match('PATCH', '/users/me')).toBeNull()
    expect(router.match('DELETE', '/users/me')).toBeNull()
  })

  it('prefers a static segment over a parameter segment', () => {
    expect(router.match('GET', '/users/me')?.route.name).toBe('UserController.me')
  })

  it('decodes captured parameters', () => {
    expect(router.match('GET', '/users/a%20b')?.params).toEqual({ id: 'a b' })
  })

  it('normalises the request path', () => {
    expect(router.match('GET', '/users/42/')?.params).toEqual({ id: '42' })
  })

  it('is case-insensitive on the method', () => {
    expect(router.match('post', '/users')?.route.name).toBe('UserController.create')
  })

  it('returns null when the method or the path does not match', () => {
    expect(router.match('DELETE', '/users/42')).toBeNull()
    expect(router.match('GET', '/articles')).toBeNull()
  })

  it('keeps the raw parameter when it is not valid percent-encoding', () => {
    expect(router.match('GET', '/users/100%')?.params).toEqual({ id: '100%' })
  })
})

describe('ApiRouter — dispatch', () => {
  it('answers a 404 JSON error when no route matches', async () => {
    const router = new ApiRouter(controllers, classMap)
    await expect(router.dispatch({ method: 'GET', path: '/articles' }))
      .resolves.toEqual({ error: { code: 404, message: 'Not Found' } })
  })

  it('invokes the handler with the request context', async () => {
    const capture = vi.fn((context: ApiRequestContext) => context)

    class CaptureController {
      capture = capture
    }

    const router = new ApiRouter(
      [
        controller({
          className: 'CaptureController',
          name: 'CaptureController',
          routes: [route('capture', '/capture/:id', 'CaptureController.capture')],
        }),
      ],
      { CaptureController },
    )

    const event = { fake: 'event' }
    const result = await router.dispatch({
      method: 'post',
      path: '/capture/7/',
      query: { page: '2' },
      headers: { 'x-test': 'yes' },
      body: { hello: 'world' },
      event,
    })

    expect(capture).toHaveBeenCalledOnce()

    const context = capture.mock.calls[0]![0]
    expect(context).toEqual({
      method: 'POST',
      path: '/capture/7',
      params: { id: '7' },
      query: { page: '2' },
      headers: { 'x-test': 'yes' },
      body: { hello: 'world' },
      event,
    })
  })

  it('invokes a handler without arguments when it declares no context', async () => {
    const capture = vi.fn(() => 'ok')

    class NoContextController {
      capture = capture
    }

    const router = new ApiRouter(
      [
        controller({
          className: 'NoContextController',
          name: 'NoContextController',
          routes: [route('capture', '/plain/:id', 'NoContextController.capture', false)],
        }),
      ],
      { NoContextController },
    )

    await expect(
      router.dispatch({ method: 'GET', path: '/plain/7' }),
    ).resolves.toEqual({ text: 'ok' })
    expect(capture).toHaveBeenCalledWith()
  })

  it('defaults the optional request fields', async () => {
    const router = new ApiRouter(controllers, classMap)
    const result = await router.dispatch({ method: 'GET', path: '/users/me' })
    expect(result).toEqual({ text: 'me' })
  })

  it('answers an empty object when the handler returns nothing', async () => {
    class EmptyController {
      nothing(): void {}
    }

    const router = new ApiRouter(
      [
        controller({
          className: 'EmptyController',
          name: 'EmptyController',
          routes: [route('nothing', '/empty', 'EmptyController.nothing', false)],
        }),
      ],
      { EmptyController },
    )

    await expect(router.dispatch({ method: 'GET', path: '/empty' }))
      .resolves.toEqual({})
  })

  it('answers the handler result as the response', async () => {
    class PayloadController {
      payload(): unknown {
        return { id: '7', done: false }
      }
    }

    const router = new ApiRouter(
      [
        controller({
          className: 'PayloadController',
          name: 'PayloadController',
          routes: [route('payload', '/payload', 'PayloadController.payload', false)],
        }),
      ],
      { PayloadController },
    )

    await expect(router.dispatch({ method: 'GET', path: '/payload' }))
      .resolves.toEqual({ id: '7', done: false })
  })

  it('wraps a thrown ApiError in a JSON error body', async () => {
    class MissingController {
      missing(): unknown {
        throw { code: 404, message: 'Todo not found' }
      }
    }

    const router = new ApiRouter(
      [
        controller({
          className: 'MissingController',
          name: 'MissingController',
          routes: [route('missing', '/missing', 'MissingController.missing', false)],
        }),
      ],
      { MissingController },
    )

    const response = await router.dispatch({ method: 'GET', path: '/missing' })

    expect(response).toEqual({ error: { code: 404, message: 'Todo not found' } })
  })

  it('reports any other thrown error as a 500', async () => {
    class BrokenController {
      broken(): unknown {
        throw new Error('boom')
      }
    }

    const router = new ApiRouter(
      [
        controller({
          className: 'BrokenController',
          name: 'BrokenController',
          routes: [route('broken', '/broken', 'BrokenController.broken', false)],
        }),
      ],
      { BrokenController },
    )

    const response = await router.dispatch({ method: 'GET', path: '/broken' })

    expect(response).toEqual({ error: { code: 500, message: 'boom' } })
  })
})
