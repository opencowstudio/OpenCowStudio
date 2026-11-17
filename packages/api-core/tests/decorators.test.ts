import { describe, it, expect } from 'vitest'
import { ApiController, ApiRoute } from '../src'

describe('Api decorators — definitions', () => {
  it('should export both decorators as functions', () => {
    expect(typeof ApiController).toBe('function')
    expect(typeof ApiRoute).toBe('function')
  })

  it('should return a decorator factory when called (no runtime side effects)', () => {
    // @ApiController is a class decorator; @ApiRoute is a method decorator.
    // Calling them returns the decorator function without throwing.
    expect(typeof ApiController({ description: 'Users' })).toBe('function')
    expect(typeof ApiRoute({ path: '/:id' })).toBe('function')
  })

  it('should leave a decorated class untouched', () => {
    class Untouched {
      ping(): string {
        return 'pong'
      }
    }

    const classContext = {
      kind: 'class',
      name: 'Untouched',
      metadata: {},
      addInitializer: () => {},
    } as unknown as ClassDecoratorContext
    const methodContext = {
      kind: 'method',
      name: 'ping',
      static: false,
      private: false,
      metadata: {},
      addInitializer: () => {},
    } as unknown as ClassMethodDecoratorContext

    expect(() => ApiController()(Untouched, classContext)).not.toThrow()
    expect(() => ApiRoute({ path: '/ping' })(Untouched.prototype.ping, methodContext)).not.toThrow()
    expect(new Untouched().ping()).toBe('pong')
  })
})
