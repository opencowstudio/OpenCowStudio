import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import {
  createProgram,
  findApiControllerDeclarations,
  parseApiController,
  parseApiControllers,
} from '../../src/builder/index.ts'

const fixture = fileURLToPath(new URL('../fixtures/controllers/user.ts', import.meta.url))

let dir: string | null = null

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = null
  }
})

/** Write one throw-away controller module and return its absolute path. */
function writeSource(source: string): string {
  if (!dir) dir = mkdtempSync(join(tmpdir(), 'api-core-parser-'))
  const file = join(dir, 'controller.ts')
  writeFileSync(file, source)
  return file
}

describe('parseApiControllers', () => {
  it('resolves every controller and route of a source file', () => {
    const controllers = parseApiControllers([fixture])

    expect(controllers).toHaveLength(2)

    const [users, health] = controllers
    expect(users).toEqual({
      className: 'UserController',
      modulePath: fixture,
      name: 'UserController',
      path: '/',
      description: 'User endpoints',
      routes: [
        { handler: 'show', methods: ['GET', 'POST'], parameters: [], path: '/users/:id', name: 'UserController.show', description: 'Read a user' },
        { handler: 'list', methods: ['GET', 'POST'], parameters: [], path: '/users', name: 'UserController.list', description: 'List users' },
        { handler: 'touch', methods: ['GET', 'POST'], parameters: [], path: '/users/touch', name: 'UserController.touch', description: '' },
      ],
    })

    expect(health).toEqual({
      className: 'HealthController',
      modulePath: fixture,
      name: 'HealthController',
      path: '/',
      description: '',
      routes: [
        { handler: 'check', methods: ['GET', 'POST'], parameters: [], path: '/health', name: 'HealthController.check', description: '' },
      ],
    })
  })

  it('records the module path through the resolver', () => {
    const controllers = parseApiControllers([fixture], {
      resolveModulePath: () => '/server/apis/user.ts',
    })
    expect(controllers.map(controller => controller.modulePath)).toEqual([
      '/server/apis/user.ts',
      '/server/apis/user.ts',
    ])
  })

  it('findApiControllerDeclarations only returns decorated classes', () => {
    const program = createProgram([fixture])
    const declarations = findApiControllerDeclarations(program, [fixture])
    expect(declarations.map(({ node }) => node.name?.text)).toEqual(['UserController', 'HealthController'])
  })

  it('parseApiController returns undefined for undecorated classes', () => {
    // The guard is exercised with a plain class declaration built from a
    // throw-away module, then confirmed against the decorated fixture class.
    const file = writeSource('export class PlainController {}\n')
    const plainProgram = createProgram([file])
    const plainSource = plainProgram.getSourceFile(file)!
    const plainClass = plainSource.statements.find(ts.isClassDeclaration)!
    expect(parseApiController(plainClass, plainSource)).toBeUndefined()

    const program = createProgram([fixture])
    const [decorated] = findApiControllerDeclarations(program, [fixture])
    expect(parseApiController(decorated!.node, decorated!.sourceFile)).toBeDefined()
  })
})

describe('parseApiControllers — validation', () => {
  it('always binds a route to GET and POST', () => {
    const file = writeSource(`
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController()
export class BothController {
  @ApiRoute({ path: '/both' })
  handler(): void {}
}
`)
    expect(parseApiControllers([file])[0]?.routes[0]?.methods).toEqual(['GET', 'POST'])
  })

  it('records the injected context parameter of every route', () => {
    const file = writeSource(`
import { ApiController, ApiRoute, type ApiRequestContext } from '@opencowstudio/api-core'

@ApiController()
export class SignatureController {
  @ApiRoute({ path: '/with' })
  withContext(context: ApiRequestContext): unknown {
    return context
  }

  @ApiRoute({ path: '/none' })
  none(): unknown {
    return null
  }
}
`)
    const routes = parseApiControllers([file])[0]?.routes
    expect(routes?.map(route => route.parameters)).toEqual([
      [{ name: 'context', source: 'context' }],
      [],
    ])
  })

  it('records a destructured parameter without a name', () => {
    const file = writeSource(`
import { ApiController, ApiRoute, type ApiRequestContext } from '@opencowstudio/api-core'

@ApiController()
export class DestructuredController {
  @ApiRoute({ path: '/destructured' })
  destructured({ params }: ApiRequestContext): unknown {
    return params
  }
}
`)
    expect(parseApiControllers([file])[0]?.routes[0]?.parameters).toEqual([
      { name: '<destructured>', source: 'context' },
    ])
  })

  it('rejects a parameter whose type is not injectable', () => {
    const file = writeSource(`
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController()
export class WrongController {
  @ApiRoute({ path: '/wrong' })
  wrong(id: string): unknown {
    return id
  }
}
`)
    expect(() => parseApiControllers([file])).toThrow(/must be typed as ApiRequestContext/)
  })

  it('rejects a rest parameter', () => {
    const file = writeSource(`
import { ApiController, ApiRoute, type ApiRequestContext } from '@opencowstudio/api-core'

@ApiController()
export class ManyController {
  @ApiRoute({ path: '/many' })
  many(...args: ApiRequestContext[]): unknown {
    return args
  }
}
`)
    expect(() => parseApiControllers([file])).toThrow(/cannot declare a rest parameter/)
  })

  it('rejects a duplicate path inside one controller', () => {
    const file = writeSource(`
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController()
export class DupController {
  @ApiRoute({ path: '/dup/x' })
  first(): void {}

  @ApiRoute({ path: '/dup/x' })
  second(): void {}
}
`)
    expect(() => parseApiControllers([file])).toThrow(/Duplicate route "GET \/dup\/x"/)
  })

  it('rejects the same route declared by two controllers', () => {
    const file = writeSource(`
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController()
export class FirstController {
  @ApiRoute({ path: '/shared/x' })
  first(): void {}
}

@ApiController()
export class SecondController {
  @ApiRoute({ path: '/shared/x' })
  second(): void {}
}
`)
    expect(() => parseApiControllers([file])).toThrow(/declared by both/)
  })

  it('rejects a @ApiRoute on a non-method member', () => {
    const file = writeSource(`
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController()
export class BadController {
  @ApiRoute({ path: '/bad' })
  handler = 1
}
`)
    expect(() => parseApiControllers([file])).toThrow(/only be declared on instance methods/)
  })

  it('rejects a @ApiRoute on a static method', () => {
    const file = writeSource(`
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController()
export class BadController {
  @ApiRoute({ path: '/bad' })
  static handler(): void {}
}
`)
    expect(() => parseApiControllers([file])).toThrow(/must be an instance method/)
  })

  it('rejects a route without a path', () => {
    const file = writeSource(`
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController()
export class BadController {
  @ApiRoute()
  handler(): void {}
}
`)
    expect(() => parseApiControllers([file])).toThrow(/Missing required path/)
  })

  it('rejects a non-string path', () => {
    const file = writeSource(`
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController()
export class BadController {
  @ApiRoute({ path: 42 })
  handler(): void {}
}
`)
    expect(() => parseApiControllers([file])).toThrow(/Invalid path for route BadController.handler.path/)
  })

  it('rejects an identifier that cannot be resolved statically', () => {
    const file = writeSource(`
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController()
export class BadController {
  @ApiRoute({ path: MISSING })
  handler(): void {}
}
`)
    expect(() => parseApiControllers([file])).toThrow(/Cannot resolve identifier "MISSING"/)
  })

  it('skips invalid controllers when skipInvalid is set', () => {
    const file = writeSource(`
import { ApiController, ApiRoute } from '@opencowstudio/api-core'

@ApiController()
export class BrokenController {
  @ApiRoute({ path: 42 })
  handler(): void {}
}

@ApiController()
export class FineController {
  @ApiRoute({ path: '/fine/ping' })
  ping(): void {}
}
`)
    const controllers = parseApiControllers([file], { skipInvalid: true })
    expect(controllers.map(controller => controller.className)).toEqual(['FineController'])
  })
})
