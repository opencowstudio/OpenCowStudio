import { describe, it, expect } from 'vitest'
import { API_BODY_METHODS, stripApiPrefix } from '../../../src/runtime/utils/request'

describe('stripApiPrefix', () => {
  it('strips the prefix from a nested path', () => {
    expect(stripApiPrefix('/api', '/api/users/42')).toBe('/users/42')
  })

  it('returns the root path for the bare prefix', () => {
    expect(stripApiPrefix('/api', '/api')).toBe('/')
    expect(stripApiPrefix('/api', '/api/')).toBe('/')
  })

  it('returns null outside the mount point', () => {
    expect(stripApiPrefix('/api', '/articles')).toBeNull()
    expect(stripApiPrefix('/api', '/')).toBeNull()
  })

  it('does not match a path that only shares the name prefix', () => {
    expect(stripApiPrefix('/api', '/apiv2/users')).toBeNull()
  })

  it('normalises both sides before comparing', () => {
    expect(stripApiPrefix('/api/', '//api//users/42/')).toBe('/users/42')
  })

  it('keeps a root prefix transparent', () => {
    expect(stripApiPrefix('/', '/users/42')).toBe('/users/42')
  })
})

describe('API_BODY_METHODS', () => {
  it('reads a body for the methods that may carry one', () => {
    expect([...API_BODY_METHODS].sort()).toEqual(['DELETE', 'PATCH', 'POST', 'PUT'])
    expect(API_BODY_METHODS.has('GET')).toBe(false)
  })
})
