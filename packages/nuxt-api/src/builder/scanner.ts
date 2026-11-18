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
 * Normalise a configured directory into a POSIX, root-relative path without a
 * leading `./` or a trailing `/`. An empty value falls back to `fallback`
 * ({@link DEFAULT_API_DIR} by default).
 *
 * Build-time only — this helper must never be imported from the runtime.
 */
export function normalizeApiDir(dir: string, fallback: string = DEFAULT_API_DIR): string {
  const posix = dir.split(sep).join('/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
  return posix.length > 0 ? posix : fallback
}

/**
 * Resolve the directory holding the input / output schemas: `<dir>/schemas`.
 *
 * The schemas live next to the controllers that declare them, so moving the
 * controller directory moves them too and there is no second option to keep in
 * sync.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @param dir The controller directory, relative to the Nuxt root.
 */
export function resolveApiSchemaDir(dir: string): string {
  return `${normalizeApiDir(dir)}/schemas`
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

/**
 * Collect the schema files below `<dir>/**\/*.ts`.
 *
 * Unlike controllers, schema files are *imported* by the generated manifest: a
 * schema is a runtime value, so there is nothing to parse statically. The export
 * names of those modules become the registry keys, i.e. the type names a handler
 * parameter or a return type may declare.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @param rootDir The Nuxt root directory.
 * @param dir The resolved schema directory, relative to `rootDir`
 *            (see {@link resolveApiSchemaDir}).
 */
export async function scanApiSchemaPaths(rootDir: string, dir: string): Promise<string[]> {
  return fg.sync(`${normalizeApiDir(dir)}/**/*.ts`, {
    cwd: rootDir,
    absolute: true,
    onlyFiles: true,
    ignore: IGNORED_PATTERNS,
  })
}
