/** Matches keys that can be emitted as a bare object literal key. */
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * Quote a string as a single-quoted literal. `JSON.stringify` already produces
 * a fully escaped double-quoted literal, so the quotes are swapped and the
 * (now unescaped) double quotes are kept as-is.
 */
function quoteString(value: string): string {
  const inner = JSON.stringify(value).slice(1, -1)
  return `'${inner.replace(/\\"/g, '"').replace(/'/g, "\\'")}'`
}

/** Emit a bare key when it is a valid identifier, otherwise a quoted one. */
function quoteKey(key: string): string {
  return IDENTIFIER_RE.test(key) ? key : quoteString(key)
}

/**
 * Serialize a value into a TypeScript object/array literal.
 *
 * Unlike `JSON.stringify`, the output follows the source style of this repo:
 * keys are left bare whenever possible, strings use single quotes, entries end
 * with a trailing comma and nesting is indented with two spaces. The generated
 * manifests are plain JavaScript (see `registerPgManifest`), so only values
 * that are valid in both JS and TS are emitted — including `undefined`, which
 * is preserved instead of being dropped like `JSON.stringify` does.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @param value The value to serialize.
 * @param indent The indentation of the enclosing block.
 */
export function toTsLiteral(value: unknown, indent = ''): string {
  const inner = `${indent}  `

  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return quoteString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map(item => `${inner}${toTsLiteral(item, inner)},`)
    return `[\n${items.join('\n')}\n${indent}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    const properties = entries.map(
      ([key, entry]) => `${inner}${quoteKey(key)}: ${toTsLiteral(entry, inner)},`,
    )
    return `{\n${properties.join('\n')}\n${indent}}`
  }

  throw new TypeError(`Cannot serialize a value of type "${typeof value}" to a TS literal.`)
}
