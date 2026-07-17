import { parse as parseYaml } from 'yaml'
import type { PgConfigMetadata } from '@opencowstudio/pg-core'

/**
 * Parse a raw YAML string into a typed PostgreSQL configuration metadata object.
 *
 * Build-time only — this helper must never be imported from the runtime.
 */
export function parsePgConfigYaml(raw: string): PgConfigMetadata {
  return parseYaml(raw) as PgConfigMetadata
}
