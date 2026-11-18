import { describe, it, expect } from 'vitest'
import {
  ApiRouter,
  formatApiIssues,
  isApiSchema,
  validateApiValue,
  resolveApiInput,
  toApiArguments,
} from '../../src/index.ts'
import type {
  ApiControllerMetadata,
  ApiValidationIssue,
  ApiSchemaRegistry,
  ApiRequest,
  ApiRouteParameter,
} from '../../src/index.ts'

/**
 * A minimal Standard Schema: `name` must be a non-empty string, `age` optional
 * and numeric. Deliberately dependency-free, because the core must not care
 * which validator produced the schema.
 */
const userSchema = {
  '~standard': {
    version: 1 as const,
    validate: (value: unknown) => {
      const issues: ApiValidationIssue[] = []
      const record = (value ?? {}) as Record<string, unknown>

      if (typeof record.name !== 'string' || record.name.length === 0) {
        issues.push({ path: ['name'], message: 'is required' })
      }
      if (record.age !== undefined && typeof record.age !== 'number') {
        issues.push({ path: ['age'], message: 'must be a number' })
      }

      return issues.length > 0 ? { issues } : { value: { name: record.name, age: record.age } }
    },
  },
}

const asyncSchema = {
  '~standard': {
    version: 1 as const,
    validate: async (value: unknown) => ({ value }),
  },
}

describe('isApiSchema', () => {
  it('accepts a Standard Schema v1 implementation', () => {
    expect(isApiSchema(userSchema)).toBe(true)
    expect(isApiSchema(asyncSchema)).toBe(true)
  })

  it('rejects values that cannot validate', () => {
    expect(isApiSchema(undefined)).toBe(false)
    expect(isApiSchema(null)).toBe(false)
    expect(isApiSchema({ name: 'not a schema' })).toBe(false)
    expect(isApiSchema({ safeParse: () => ({ success: true, data: {} }) })).toBe(false)
    expect(isApiSchema({ parse: () => ({}) })).toBe(false)
    expect(isApiSchema('string')).toBe(false)
  })
})

describe('validateApiValue', () => {
  it('returns the value of a Standard Schema', () => {
    expect(validateApiValue(userSchema, { name: 'ann', age: 3 })).toEqual({ value: { name: 'ann', age: 3 } })
  })

  it('reports the issues of a Standard Schema', () => {
    expect(validateApiValue(userSchema, {})).toEqual({ issues: [{ path: ['name'], message: 'is required' }] })
  })

  it('drops issue path segments that cannot be rendered', () => {
    const symbolKey = Symbol('internal')
    const symbolPathSchema = {
      '~standard': {
        version: 1 as const,
        validate: () => ({ issues: [{ path: [symbolKey, 'name'], message: 'is required' }] }),
      },
    }

    expect(validateApiValue(symbolPathSchema, {})).toEqual({ issues: [{ path: ['name'], message: 'is required' }] })
  })

  it('rejects an async schema instead of injecting a promise', () => {
    expect(() => validateApiValue(asyncSchema, {})).toThrow(/Async schemas are not supported/)
  })
})

describe('formatApiIssues', () => {
  it('prefixes every issue with its path', () => {
    expect(formatApiIssues([
      { path: ['group', 'name'], message: 'is required' },
      { path: ['tags', 0], message: 'must be a string' },
      { message: 'unexpected end of input' },
    ])).toBe(
      'Invalid request body: group.name is required; tags[0] must be a string; unexpected end of input',
    )
  })
})

describe('resolveApiInput', () => {
  const registry: ApiSchemaRegistry = { CreateUserInput: userSchema }

  it('resolves a schema by type name and returns the parsed value', () => {
    expect(resolveApiInput(registry, 'CreateUserInput', { name: 'ann' })).toEqual({ name: 'ann', age: undefined })
  })

  it('throws a 400 carrying every issue when the body is invalid', () => {
    try {
      resolveApiInput(registry, 'CreateUserInput', { age: 'x' })
      expect.unreachable('the invalid body must throw')
    } catch (thrown) {
      expect(thrown).toMatchObject({ code: 400 })
      expect((thrown as { message: string }).message).toContain('name is required')
      expect((thrown as { message: string }).message).toContain('age must be a number')
      expect((thrown as { issues: ApiValidationIssue[] }).issues).toHaveLength(2)
    }
  })

  it('throws a 500 when the schema is missing from the registry', () => {
    expect(() => resolveApiInput(registry, 'MissingInput', {})).toThrow(/is not registered/)
  })
})

describe('toApiArguments — input injection', () => {
  const context = {
    path: '/users',
    params: {},
    query: {},
    headers: {},
    body: { name: 'ann' },
  } satisfies ApiRequest

  const inputParameter = (name: string, inputTypeName: string): ApiRouteParameter =>
    ({ name, source: 'input', inputTypeName })

  it('injects any number of input parameters, in declaration order', () => {
    const args = toApiArguments(
      context,
      [
        inputParameter('first', 'CreateUserInput'),
        { name: 'request', source: 'request' },
        inputParameter('second', 'CreateUserInput'),
      ],
      { CreateUserInput: userSchema },
    )

    expect(args).toHaveLength(3)
    expect(args[0]).toEqual({ name: 'ann', age: undefined })
    expect(args[2]).toEqual({ name: 'ann', age: undefined })
    expect(args[1]).toBe(context)
  })

  it('fails the argument list when the request JSON is invalid', () => {
    const invalid = { ...context, body: { age: 'x' } }
    expect(() => toApiArguments(invalid, [inputParameter('input', 'CreateUserInput')], { CreateUserInput: userSchema }))
      .toThrow(/Invalid request body/)
  })
})

describe('ApiRouter — input injection', () => {
  const handler = (input: unknown, context: ApiRequest): unknown => ({ input, path: context.path })

  const metadata: ApiControllerMetadata[] = [
    {
      className: 'UserController',
      name: 'UserController',
      path: '/',
      description: '',
      modulePath: '/server/apis/user.ts',
      routes: [
        {
          handler: 'create',
          methods: ['POST'],
          parameters: [
            { name: 'input', source: 'input', inputTypeName: 'CreateUserInput' },
            { name: 'request', source: 'request' },
          ],
          path: '/users',
          name: 'UserController.create',
          description: '',
          output: 'UserOutput',
        },
      ],
    },
  ]

  class UserController {
    create = handler
  }

  it('injects the parsed body and answers it', async () => {
    const router = new ApiRouter(metadata, { UserController }, { CreateUserInput: userSchema })

    await expect(router.dispatch({ method: 'POST', path: '/users', body: { name: 'ann' } }))
      .resolves.toEqual({ input: { name: 'ann', age: undefined }, path: '/users' })
  })

  it('answers 400 before the handler runs when the body is invalid', async () => {
    const router = new ApiRouter(metadata, { UserController }, { CreateUserInput: userSchema })

    const response = await router.dispatch({ method: 'POST', path: '/users', body: {} })
    expect(response).toEqual({
      error: { code: 400, message: 'Invalid request body: name is required' },
    })
  })

  it('answers 500 when the schema was never registered', async () => {
    const router = new ApiRouter(metadata, { UserController })

    const response = await router.dispatch({ method: 'POST', path: '/users', body: { name: 'ann' } })
    expect(response).toMatchObject({ error: { code: 500 } })
  })
})
