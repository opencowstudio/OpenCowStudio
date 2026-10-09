import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// `generateId` encodes whatever `uuid.v7()` returns. The stub feeds
// deterministic UUIDs into the encoder while every other test keeps using the
// real implementation.
const uuidStub = vi.hoisted(() => ({ guid: undefined as string | undefined }))

vi.mock('uuid', async (importOriginal) => {
  const actual = await importOriginal<typeof import('uuid')>()
  return {
    ...actual,
    v7: vi.fn((options?: Parameters<typeof actual.v7>[0]) =>
      uuidStub.guid ?? actual.v7(options),
    ),
  }
})

import { generateGuid, generateId } from '../../src/utils/id'

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BASE55_CHARSET = '0123456789ABCDEFGHJKLMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz'

const DETERMINISTIC_UUIDS = [
  '0190b8a4-3b2c-7f01-8a3d-1c2b3a4d5e6f',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0001-0000-0000-000000000000',
  'ffffffff-ffff-7fff-bfff-ffffffffffff',
]

/**
 * Oracle for the byte-array encoder: a base-55 conversion built on `BigInt`.
 * Both implementations must agree on every input.
 */
function referenceBase55(guid: string): string {
  const num = BigInt(`0x${guid.replace(/-/g, '')}`)
  const zero = BigInt(0)

  if (num === zero) {
    return BASE55_CHARSET[0]!
  }

  const base = BigInt(BASE55_CHARSET.length)
  let result = ''
  let remaining = num

  while (remaining > zero) {
    result = BASE55_CHARSET[Number(remaining % base)]! + result
    remaining = remaining / base
  }

  return result
}

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
  afterEach(() => {
    uuidStub.guid = undefined
  })

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

  it.each(DETERMINISTIC_UUIDS)('should encode %s like the BigInt reference', (guid) => {
    uuidStub.guid = guid
    expect(generateId()).toBe(referenceBase55(guid))
  })

  it('should encode an all-zero UUID as the first charset character', () => {
    uuidStub.guid = '00000000-0000-0000-0000-000000000000'
    expect(generateId()).toBe(BASE55_CHARSET[0])
  })

  it('should agree with the BigInt reference on random UUIDs', () => {
    for (let i = 0; i < 200; i += 1) {
      uuidStub.guid = undefined
      const guid = generateGuid()
      uuidStub.guid = guid
      expect(generateId()).toBe(referenceBase55(guid))
    }
  })

  it('should stay free of BigInt so any esbuild target can bundle it', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../src/utils/id.ts', import.meta.url)),
      'utf8',
    )
    // Strip comments: only the executable code must avoid BigInt.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

    expect(code).not.toContain('BigInt')
  })
})
