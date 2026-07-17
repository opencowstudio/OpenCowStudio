import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useLogger } from '@nuxt/kit'
import type { PgConfigMetadata } from '@opencowstudio/pg-core'
import { findPgConfigFile } from './scanner'
import { parsePgConfigYaml } from './yaml'

const MODULE_NAME = '@opencowstudio/nuxt-pg'

/**
 * Locate, read and parse the pg config file into a `PgConfigMetadata` object.
 * Returns `null` when no config file is present, leaving the runtime to skip
 * datasource initialization.
 *
 * Build-time only — this helper must never be imported from the runtime.
 */
export function loadPgConfigMetadata(rootDir: string, configFile: string): PgConfigMetadata | null {
  const logger = useLogger(MODULE_NAME)
  const configPath = findPgConfigFile(rootDir, configFile)

  if (!configPath) {
    logger.warn(`No pg config file found at: ${resolve(rootDir, configFile)}`)
    return null
  }

  logger.info(`Found pg config file: ${configPath}`)
  const raw = readFileSync(configPath, 'utf8')
  return parsePgConfigYaml(raw)
}
