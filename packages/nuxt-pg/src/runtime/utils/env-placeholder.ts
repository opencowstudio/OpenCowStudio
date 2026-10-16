import { Placeholder } from '@opencowstudio/core'
import type {
  PgConfigMetadata,
  PgDatabaseMetadata,
  PgNodeMetadata,
} from '@opencowstudio/pg-core'

/**
 * Resolve every `${VAR:default}` / `${VAR}` placeholder found in the string
 * values of the build-time `PgConfigMetadata`.
 *
 * The build bakes the typed metadata into the manifest but leaves placeholders
 * intact, because their values (e.g. `${DB_PASSWORD}`) only exist in the
 * runtime environment. A required variable with no default throws, so the
 * caller can decide whether to abort startup.
 *
 * @param metadata The metadata exported by `#pg-manifest`.
 * @param env Source of variable values. Defaults to `process.env`.
 */
export function resolvePgConfigPlaceholders(
  metadata: PgConfigMetadata,
  env: NodeJS.ProcessEnv = process.env,
): PgConfigMetadata {
  const placeholder = new Placeholder({ env })

  const resolveNode = (node: PgNodeMetadata): PgNodeMetadata => ({
    url: placeholder.resolve(node.url),
    username: placeholder.resolve(node.username),
    password: placeholder.resolve(node.password),
  })

  const databases: Record<string, PgDatabaseMetadata> = {}
  for (const [dbName, db] of Object.entries(metadata.databases)) {
    databases[dbName] = {
      master: resolveNode(db.master),
      slaves: db.slaves.map(resolveNode),
    }
  }

  // Pool values are numeric, so they carry no placeholders.
  return { pool: { ...metadata.pool }, databases }
}
