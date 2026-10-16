import { parse as parseYaml } from 'yaml'

/**
 * Extract the `pg` namespace from a raw YAML string as a generic, untyped JSON
 * object. The result feeds `parsePgConfig`, which coerces it into the typed
 * `PgConfigMetadata` baked into the manifest.
 *
 * Build-time only — this helper must never be imported from the runtime.
 */
export function readPgConfigNamespace(raw: string): Record<string, unknown> | null {
  const parsed = parseYaml(raw) as { pg?: Record<string, unknown> }
  return parsed?.pg ?? null
}
