import { sep } from 'node:path'
import fg from 'fast-glob'

/** Directory scanned when the module option does not name one. */
export const DEFAULT_API_DIR = 'server/apis'

/**
 * Patterns whose content never takes part in the scan: test fixtures, test
 * files and declaration files do not declare controllers of the application.
 */
const IGNORED_PATTERNS = ['**/tests/**', '**/*.test.ts', '**/*.spec.ts', '**/*.d.ts']

/**
 * Normalise the configured controller directory into a POSIX, root-relative
 * path without a leading `./` or a trailing `/`. An empty value falls back to
 * {@link DEFAULT_API_DIR}.
 *
 * Build-time only — this helper must never be imported from the runtime.
 */
export function normalizeApiDir(dir: string): string {
  const posix = dir.split(sep).join('/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
  return posix.length > 0 ? posix : DEFAULT_API_DIR
}

/**
 * Collect the controller source files by expanding `<dir>/**\/*.ts` relative to
 * the Nuxt root directory and returning the absolute paths of every matched
 * file. The files are later parsed statically (no module import, no class
 * instantiation) by `registerApiManifest` via api-core's parser.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @param rootDir The Nuxt root directory.
 * @param dir The controller directory, relative to `rootDir`.
 */
export async function scanApiControllerPaths(
  rootDir: string,
  dir: string = DEFAULT_API_DIR,
): Promise<string[]> {
  return fg.sync(`${normalizeApiDir(dir)}/**/*.ts`, {
    cwd: rootDir,
    absolute: true,
    onlyFiles: true,
    ignore: IGNORED_PATTERNS,
  })
}
