// @opencowstudio/core — shared, framework-agnostic core helpers.
//
// Exposes id-generation helpers (UUID v7 + base-55 encoding) under `utils/` that
// are reused across multiple packages such as @opencowstudio/pg-core and
// @opencowstudio/nuxt-pg. This package has no dependency on Nuxt or any
// database driver so it can be consumed in any Node.js environment.

export { generateGuid, generateId } from './utils/id'
export { Placeholder, resolvePlaceholders } from './utils/placeholder'
export type { PlaceholderOptions } from './utils/placeholder'
