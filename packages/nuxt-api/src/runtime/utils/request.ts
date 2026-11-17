import { normalizeApiPath } from '@opencowstudio/api-core'

/**
 * Methods whose body the handler parses before dispatching. Reading the body
 * consumes the request stream, so it only happens once a route has matched.
 */
export const API_BODY_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Strip the mount prefix from a request path.
 *
 * Returns the route-relative path (`/` for the bare prefix) when the request
 * belongs to the mount point, and null when it does not — the caller must then
 * leave the request untouched.
 *
 * ```ts
 * stripApiPrefix('/api', '/api/users/42') // '/users/42'
 * stripApiPrefix('/api', '/api')          // '/'
 * stripApiPrefix('/api', '/articles')     // null
 * ```
 */
export function stripApiPrefix(prefix: string, path: string): string | null {
  const normalizedPrefix = normalizeApiPath(prefix)
  const normalizedPath = normalizeApiPath(path)

  if (normalizedPrefix === '/') return normalizedPath
  if (normalizedPath === normalizedPrefix) return '/'
  if (!normalizedPath.startsWith(`${normalizedPrefix}/`)) return null

  return normalizedPath.slice(normalizedPrefix.length)
}
