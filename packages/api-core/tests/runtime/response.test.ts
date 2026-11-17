import { describe, it, expect } from 'vitest'
import {
  getApiError,
  isApiError,
  toApiError,
  toApiErrorBody,
  toApiResponse,
} from '../../src/index.ts'

describe('isApiError', () => {
  it('accepts an object with an HTTP error code and a message', () => {
    expect(isApiError({ code: 400, message: 'Bad Request' })).toBe(true)
    expect(isApiError({ code: 503, message: 'Unavailable', extra: true })).toBe(true)
  })

  it('rejects a code outside the error range', () => {
    expect(isApiError({ code: 200, message: 'OK' })).toBe(false)
    expect(isApiError({ code: 99, message: 'Too low' })).toBe(false)
    expect(isApiError({ code: 600, message: 'Too high' })).toBe(false)
    expect(isApiError({ code: 400.5, message: 'Fractional' })).toBe(false)
  })

  it('rejects anything that is not an error object', () => {
    expect(isApiError({ code: 400 })).toBe(false)
    expect(isApiError({ message: 'Bad Request' })).toBe(false)
    expect(isApiError(new Error('boom'))).toBe(false)
    expect(isApiError('boom')).toBe(false)
    expect(isApiError(null)).toBe(false)
    expect(isApiError(undefined)).toBe(false)
  })
})

describe('toApiError', () => {
  it('keeps a thrown ApiError as-is', () => {
    expect(toApiError({ code: 404, message: 'Todo not found' })).toEqual({
      code: 404,
      message: 'Todo not found',
    })
  })

  it('reports a thrown Error as a 500 carrying its message', () => {
    expect(toApiError(new Error('boom'))).toEqual({ code: 500, message: 'boom' })
  })

  it('reports a thrown string as a 500 carrying it', () => {
    expect(toApiError('boom')).toEqual({ code: 500, message: 'boom' })
  })

  it('falls back to a generic 500 for an unusable value', () => {
    expect(toApiError(undefined)).toEqual({ code: 500, message: 'Internal Server Error' })
    expect(toApiError(new Error(''))).toEqual({ code: 500, message: 'Internal Server Error' })
    expect(toApiError(42)).toEqual({ code: 500, message: 'Internal Server Error' })
  })
})

describe('getApiError', () => {
  it('reads the error carried by a failed response', () => {
    expect(getApiError({ error: { code: 404, message: 'Not Found' } })).toEqual({
      code: 404,
      message: 'Not Found',
    })
  })

  it('answers undefined when the response carries no error', () => {
    expect(getApiError({ id: '7' })).toBeUndefined()
    expect(getApiError({ error: 'boom' })).toBeUndefined()
    expect(getApiError([{ error: { code: 400, message: 'Bad Request' } }])).toBeUndefined()
    expect(getApiError('text')).toBeUndefined()
    expect(getApiError(null)).toBeUndefined()
  })
})

describe('toApiResponse', () => {
  it('answers an empty object when the handler returned nothing', () => {
    expect(toApiResponse(undefined)).toEqual({})
  })

  it('wraps a string result as `{ text }`', () => {
    expect(toApiResponse('text')).toEqual({ text: 'text' })
    expect(toApiResponse('')).toEqual({ text: '' })
  })

  it('answers any other value as-is', () => {
    const payload = { id: '7', done: false }
    expect(toApiResponse(payload)).toBe(payload)
    expect(toApiResponse([1, 2])).toEqual([1, 2])
    expect(toApiResponse(0)).toBe(0)
    expect(toApiResponse(false)).toBe(false)
    expect(toApiResponse(null)).toBeNull()
  })
})

describe('toApiErrorBody', () => {
  it('wraps the normalised error in an `error` key', () => {
    expect(toApiErrorBody({ code: 400, message: 'Bad Request' })).toEqual({
      error: { code: 400, message: 'Bad Request' },
    })
    expect(toApiErrorBody(new Error('boom'))).toEqual({
      error: { code: 500, message: 'boom' },
    })
  })
})
