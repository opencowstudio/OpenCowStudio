import { describe, it, expect } from 'vitest'
import { Placeholder, resolvePlaceholders } from '../../src/utils/placeholder'

const ENV: NodeJS.ProcessEnv = {
  HOST: 'localhost',
  PORT: '5432',
  EMPTY: '',
}

describe('Placeholder', () => {
  const placeholder = new Placeholder({ env: ENV })

  it('should use the env value when the variable is configured', () => {
    expect(placeholder.resolve('host=${HOST}')).toBe('host=localhost')
  })

  it('should use the default value when the variable is not configured', () => {
    expect(placeholder.resolve('port=${PORT:8080}')).toBe('port=5432')
    expect(placeholder.resolve('port=${MISSING:8080}')).toBe('port=8080')
  })

  it('should treat an explicitly empty env value as configured', () => {
    expect(placeholder.resolve('value=${EMPTY:fallback}')).toBe('value=')
  })

  it('should treat an empty default (${name:}) as having a default, not required', () => {
    expect(placeholder.resolve('value=${MISSING:}')).toBe('value=')
  })

  it('should resolve multiple placeholders in one pass', () => {
    expect(
      placeholder.resolve('${HOST}:${PORT} -> ${MISSING:default}'),
    ).toBe('localhost:5432 -> default')
  })

  it('should leave unmatched text untouched', () => {
    expect(placeholder.resolve('no placeholders here')).toBe(
      'no placeholders here',
    )
  })

  it('should throw when a required variable (no default) is missing', () => {
    expect(() => placeholder.resolve('${REQUIRED}')).toThrowError(
      /missing required variable\(s\) not found in environment: REQUIRED/,
    )
  })

  it('should collect and report every missing required variable', () => {
    expect(() => placeholder.resolve('${A} ${B}')).toThrowError(/A.*B/)
  })
})

describe('resolvePlaceholders', () => {
  it('should resolve placeholders using a provided env', () => {
    expect(resolvePlaceholders('${HOST:default}', ENV)).toBe('localhost')
  })

  it('should fall back to process.env by default', () => {
    const previous = process.env.PLACEHOLDER_TEST
    process.env.PLACEHOLDER_TEST = 'from-process-env'
    try {
      expect(resolvePlaceholders('${PLACEHOLDER_TEST:default}')).toBe(
        'from-process-env',
      )
    } finally {
      if (previous === undefined) {
        delete process.env.PLACEHOLDER_TEST
      } else {
        process.env.PLACEHOLDER_TEST = previous
      }
    }
  })
})
