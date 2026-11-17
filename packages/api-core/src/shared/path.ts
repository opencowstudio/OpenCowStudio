// ---------------------------------------------------------------------------
// Route path helpers shared by the build-time parser and the runtime router.
//
// The parser normalises the paths declared in decorators, and the router
// composes a controller base path with a route path and matches incoming
// requests against the result. Both must agree on the normal form, so the
// helpers live here instead of on either side.
// ---------------------------------------------------------------------------

/**
 * Normalise a route path: a single leading `/`, no trailing `/` and no empty
 * segments. The root path stays `/`.
 *
 * @param path The declared or requested path, e.g. `users//:id/`.
 */
export function normalizeApiPath(path: string): string {
  const segments = path.split('/').filter(segment => segment.length > 0)
  return segments.length === 0 ? '/' : `/${segments.join('/')}`
}

/**
 * Join a controller base path with a route path and normalise the result.
 *
 * @param basePath The controller base path, e.g. `/users`.
 * @param routePath The route path relative to it, e.g. `/:id`.
 */
export function joinApiPaths(basePath: string, routePath: string): string {
  const base = normalizeApiPath(basePath)
  const route = normalizeApiPath(routePath)
  if (base === '/') return route
  if (route === '/') return base
  return normalizeApiPath(`${base}/${route}`)
}
