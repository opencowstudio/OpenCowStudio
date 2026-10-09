import { v7 as uuidv7 } from 'uuid'

const BASE55_CHARSET = '0123456789ABCDEFGHJKLMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz'
const BASE55_LENGTH = BASE55_CHARSET.length

/**
 * Generate a random UUID v7 (time-ordered).
 */
export function generateGuid(): string {
  return uuidv7()
}

/**
 * Convert a hex string into its big-endian byte array (two hex characters per
 * byte).
 */
function hexToBytes(hex: string): number[] {
  const bytes: number[] = []

  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16))
  }

  return bytes
}

/**
 * Encode a big-endian byte array in base-55 using BASE55_CHARSET.
 *
 * The long division is performed in place on the byte array, so the encoding
 * stays exact without relying on `BigInt` (ES2020). Every intermediate value is
 * at most `255 + 54 * 256`, well within Number's safe integer range.
 */
function encodeBase55(bytes: number[]): string {
  const value = [...bytes]
  // Index of the first byte that has not been shifted out yet; everything
  // before it is zero and can be skipped by the division below.
  let start = 0
  const digits: number[] = []

  while (start < value.length) {
    while (start < value.length && value[start] === 0) {
      start += 1
    }

    // The value reached zero: no more digits to produce.
    if (start === value.length) {
      break
    }

    let remainder = 0

    for (let i = start; i < value.length; i += 1) {
      const current = remainder * 256 + value[i]!
      value[i] = Math.floor(current / BASE55_LENGTH)
      remainder = current % BASE55_LENGTH
    }

    digits.push(remainder)
  }

  // Zero encodes as the first character of the charset.
  if (digits.length === 0) {
    return BASE55_CHARSET[0]!
  }

  let result = ''

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    result += BASE55_CHARSET[digits[i]!]
  }

  return result
}

/**
 * Generate a unique ID by converting a UUID v7 to a base-55 encoded string.
 *
 * Steps:
 * 1. Generate a UUID v7
 * 2. Strip hyphens to get a 32-char hex string
 * 3. Convert the hex string into a 16-byte big-endian array
 * 4. Encode in base-55 using the custom charset
 */
export function generateId(): string {
  const hex = uuidv7().replace(/-/g, '')
  return encodeBase55(hexToBytes(hex))
}
