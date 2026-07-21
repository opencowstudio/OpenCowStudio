import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import fg from 'fast-glob'

/**
 * Resolve the pg config file path relative to the Nuxt root directory and
 * return it only when the file actually exists on disk.
 *
 * Build-time only — this helper must never be imported from the runtime.
 */
export function findPgConfigFile(rootDir: string, configFile: string): string | null {
  const configPath = resolve(rootDir, configFile)
  return existsSync(configPath) ? configPath : null
}

/**
 * Collect entity classes by expanding the given glob patterns relative to the
 * Nuxt root directory, importing every matched file, and collecting each
 * `function`-typed export (which includes entity classes) into a Set.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @returns A Set of entity classes (function-typed exports) discovered across
 *          all scanned files.
 */
export async function scanEntityPaths(rootDir: string, patterns: string[]): Promise<Set<Function>> {
  const files = fg.sync(patterns, {
    cwd: rootDir,
    absolute: true,
    onlyFiles: true,
  })

  const entities = new Set<Function>()
  for (const file of files) {
    const mod = await import(file)
    for (const key of Object.keys(mod)) {
      const value = (mod as Record<string, unknown>)[key]
      if (typeof value === 'function') {
        entities.add(value as Function)
      }
    }
  }
  return entities
}
