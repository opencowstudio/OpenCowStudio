import { describe, it, expect } from 'vitest'
import { joinApiPaths, normalizeApiPath } from '../../src'

describe('normalizeApiPath', () => {
  it('adds a single leading slash', () => {
    expect(normalizeApiPath('users/:id')).toBe('/users/:id')
  })

  it('drops trailing slashes', () => {
    expect(normalizeApiPath('/users/')).toBe('/users')
  })

  it('collapses duplicated separators', () => {
    expect(normalizeApiPath('//users//:id//')).toBe('/users/:id')
  })

  it('keeps the root path as a single slash', () => {
    expect(normalizeApiPath('')).toBe('/')
    expect(normalizeApiPath('/')).toBe('/')
    expect(normalizeApiPath('///')).toBe('/')
  })
})

describe('joinApiPaths', () => {
  it('joins a base path and a route path', () => {
    expect(joinApiPaths('/users', '/:id')).toBe('/users/:id')
  })

  it('returns the other side when one side is the root', () => {
    expect(joinApiPaths('/', '/:id')).toBe('/:id')
    expect(joinApiPaths('/users', '')).toBe('/users')
  })

  it('normalises duplicated separators on both sides', () => {
    expect(joinApiPaths('/users/', '//:id/')).toBe('/users/:id')
  })
})
