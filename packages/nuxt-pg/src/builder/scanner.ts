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
 * Glob patterns locating the entity source files to scan, resolved relative to
 * the Nuxt root directory.
 *
 * An entity always lives in an `entities/` directory below the Nuxt root, so
 * the patterns are fixed rather than configurable.
 */
const ENTITY_PATTERNS = ['**/entities/**/*.ts']

/**
 * Directories whose content never takes part in the scan.
 *
 * An entity declared under a `tests` directory is a test fixture, not part of
 * the running application, so it must not be registered as a repository.
 */
const IGNORED_ENTITY_DIRS = ['**/tests/**']

/**
 * Collect entity source files by expanding {@link ENTITY_PATTERNS} relative to
 * the Nuxt root directory and returning the absolute paths of every matched
 * file. The matching files are later parsed statically (no module import, no
 * class instantiation) by `registerPgEntityManifest` via pg-core's parser.
 *
 * Files living under a `tests` directory are skipped (see
 * {@link IGNORED_ENTITY_DIRS}).
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @returns The absolute paths of every entity source file matched.
 */
export async function scanEntityPaths(rootDir: string): Promise<string[]> {
  return fg.sync(ENTITY_PATTERNS, {
    cwd: rootDir,
    absolute: true,
    onlyFiles: true,
    ignore: IGNORED_ENTITY_DIRS,
  })
}
