import { describe, it, expect } from 'vitest'
import { generateGuid, generateId } from '~/server/utils/id'

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BASE55_CHARSET = '0123456789ABCDEFGHJKLMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz'

describe('generateGuid', () => {
  it('should return a valid UUID v7 string', () => {
    const guid = generateGuid()
    expect(guid).toMatch(UUID_V7_REGEX)
  })

  it('should generate unique GUIDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateGuid()))
    expect(ids.size).toBe(100)
  })
})

describe('generateId', () => {
  it('should only contain characters from the base-55 charset', () => {
    const id = generateId()
    for (const ch of id) {
      expect(BASE55_CHARSET).toContain(ch)
    }
  })

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })

  it('should produce a shorter encoding than the raw hex UUID', () => {
    const id = generateId()
    const hexLength = 32 // UUID without hyphens
    expect(id.length).toBeLessThan(hexLength)
  })
})
