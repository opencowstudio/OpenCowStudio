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
 * Collect entity source files by expanding the given glob patterns relative to
 * the Nuxt root directory and returning the absolute paths of every matched
 * file. The matching files are later parsed statically (no module import, no
 * class instantiation) by `registerPgEntityManifest` via pg-core's parser.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @returns The absolute paths of every entity source file matched.
 */
export async function scanEntityPaths(rootDir: string, patterns: string[]): Promise<string[]> {
  return fg.sync(patterns, {
    cwd: rootDir,
    absolute: true,
    onlyFiles: true,
  })
}
