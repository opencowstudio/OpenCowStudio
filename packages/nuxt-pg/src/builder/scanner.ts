import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

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
