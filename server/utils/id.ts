import { v7 as uuidv7 } from 'uuid'

const BASE55_CHARSET = '0123456789ABCDEFGHJKLMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz'

/**
 * Generate a random UUID v7 (time-ordered).
 */
export function generateGuid(): string {
  return uuidv7()
}

/**
 * Generate a unique ID by converting a UUID v7 to a base-55 encoded string.
 *
 * Steps:
 * 1. Generate a UUID v7
 * 2. Strip hyphens to get a 32-char hex string
 * 3. Parse as a BigInt
 * 4. Encode in base-55 using the custom charset
 */
export function generateId(): string {
  const guid = uuidv7()
  const hex = guid.replace(/-/g, '')
  const num = BigInt(`0x${hex}`)

  if (num === 0n) return BASE55_CHARSET[0]

  const base = BigInt(BASE55_CHARSET.length)
  let result = ''
  let remaining = num

  while (remaining > 0n) {
    result = BASE55_CHARSET[Number(remaining % base)] + result
    remaining = remaining / base
  }

  return result
}
