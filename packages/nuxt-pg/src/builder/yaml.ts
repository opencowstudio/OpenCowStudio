import { parse as parseYaml } from 'yaml'
import type { PgConfigMetadata } from '@opencowstudio/pg-core'

/**
 * Parse a raw YAML string into a typed PostgreSQL configuration metadata object.
 * The datasource config lives under the top-level `pg` namespace.
 *
 * Build-time only — this helper must never be imported from the runtime.
 */
export function parsePgConfigYaml(raw: string): PgConfigMetadata | null {
  const parsed = parseYaml(raw) as { pg?: PgConfigMetadata }
  return parsed?.pg ?? null
}
