import { readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { addTemplate, useLogger } from '@nuxt/kit'
import type { Nuxt } from 'nuxt/schema'
import { parsePgEntities } from '@opencowstudio/pg-core/builder'
import type { PgConfigMetadata, EntityMetadata } from '@opencowstudio/pg-core'
import { toTsLiteral } from './codegen'
import { parsePgConfig } from './pg-config-parser'
import { findPgConfigFile, scanEntityPaths } from './scanner'
import { readPgConfigNamespace } from './yaml'

const MODULE_NAME = '@opencowstudio/nuxt-pg'

/** Alias under which the generated manifest is exposed to the runtime. */
export const PG_MANIFEST_ALIAS = '#pg-manifest'

/** Alias under which the generated entity manifest is exposed to the runtime. */
export const PG_ENTITIES_MANIFEST_ALIAS = '#pg-entities-manifest'

/** Nuxt alias of the project root, used to address entity modules. */
const ROOT_ALIAS = '~~'

/**
 * The entity classes declared by a single module, i.e. the metadata needed to
 * emit one `import` statement in the generated entity manifest.
 */
export interface PgEntityImportMetadata {
  /**
   * Path of the module declaring the classes, as recorded in the entity
   * metadata: relative to the Nuxt root with a leading `/` (e.g.
   * `/server/entities/user.ts`).
   */
  modulePath: string
  /** Class names declared in that module, in discovery order. */
  classNames: string[]
}

/**
 * Group the entity metadata by declaring module, so every module yields exactly
 * one import statement carrying all of its entity classes.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @param entities The resolved entity metadata.
 */
export function collectPgEntityImports(entities: EntityMetadata[]): PgEntityImportMetadata[] {
  const byModule = new Map<string, string[]>()

  for (const { modulePath, className } of entities) {
    const classNames = byModule.get(modulePath)
    if (classNames) {
      classNames.push(className)
    } else {
      byModule.set(modulePath, [className])
    }
  }

  return [...byModule].map(([modulePath, classNames]) => ({ modulePath, classNames }))
}

/**
 * Turn a recorded module path into the specifier used by the generated manifest.
 * The path is root-relative, so it is addressed through the root alias instead
 * of the `~`/`@` alias (which points at the source directory).
 *
 * @param modulePath Root-relative module path, e.g. `/server/entities/user.ts`.
 */
export function toPgEntityImportPath(modulePath: string): string {
  return `${ROOT_ALIAS}${modulePath.startsWith('/') ? modulePath : `/${modulePath}`}`
}

/** Emit one import statement per module, listing all of its entity classes. */
function toPgEntityImportLines(imports: PgEntityImportMetadata[]): string[] {
  return imports.map(
    ({ modulePath, classNames }) => `import { ${classNames.join(', ')} } from '${toPgEntityImportPath(modulePath)}'`,
  )
}

/**
 * Emit the className -> imported class map, so the runtime can address the
 * entity classes by the names recorded in the metadata.
 */
function toPgEntitiesTypeMapLiteral(imports: PgEntityImportMetadata[]): string {
  const classNames = imports.flatMap(({ classNames }) => classNames)
  if (classNames.length === 0) return '{}'

  const entries = classNames.map(className => `  ${className}: ${className},`)
  return `{\n${entries.join('\n')}\n}`
}

/**
 * Read the pg config file at build time, parse its `pg` namespace directly into
 * a `PgConfigMetadata`, and bake that metadata into a server-only manifest. The
 * runtime imports the metadata as-is, so the YAML file is never re-read at
 * runtime and credentials never reach the client bundle.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @returns The destination path of the generated manifest template.
 */
export function registerPgManifest(nuxt: Nuxt, configFile: string): string {
  const logger = useLogger(MODULE_NAME)
  const configPath = findPgConfigFile(nuxt.options.rootDir, configFile)

  // The typed metadata, or null when no config is found so the runtime can skip
  // datasource initialization.
  let pgConfigMetadata: PgConfigMetadata | null = null

  if (!configPath) {
    logger.warn(`No pg config file found at: ${resolve(nuxt.options.rootDir, configFile)}`)
  } else {
    logger.info(`Found pg config file: ${configPath}`)
    const raw = readFileSync(configPath, 'utf8')
    const pgNamespace = readPgConfigNamespace(raw)
    if (!pgNamespace) {
      logger.warn(`No \`pg\` namespace found in config file: ${configPath}`)
    } else {
      pgConfigMetadata = parsePgConfig(pgNamespace)
    }
  }

  const manifest = addTemplate({
    filename: 'pg.manifest.ts',
    write: true,
    // The template is written into the Nuxt build directory (which lives under
    // `node_modules` by default), so rollup skips the TypeScript transform on
    // it. Emit plain JavaScript — the runtime types come from the ambient
    // `declare module` declarations in `src/runtime/types.d.ts`.
    getContents: () =>
      [
        '// This file is auto-generated by @opencowstudio/nuxt-pg. Do not edit manually.',
        '',
        `export const pgConfigMetadata = ${pgConfigMetadata ? toTsLiteral(pgConfigMetadata) : 'null'}`,
        '',
      ].join('\n'),
  })

  // Expose the manifest via alias. Nuxt forwards `nuxt.options.alias` into the
  // Nitro build, so the server plugin can resolve `#pg-manifest` as well.
  nuxt.options.alias[PG_MANIFEST_ALIAS] = manifest.dst
  return manifest.dst
}

/**
 * Scan the entity source files, resolve every discovered entity class into a
 * `EntityMetadata` by parsing its decorators statically (no module import,
 * no class instantiation), and bake that typed collection into a server-only
 * manifest at build time.
 *
 * The scanned locations are fixed (see `scanEntityPaths`): every entity lives
 * in an `entities/` directory below the Nuxt root, and anything under a `tests`
 * directory is a fixture and therefore skipped.
 *
 * Besides the decorator-derived metadata, every entity records its class name
 * and the module path (`import.meta.glob` form, relative to the Nuxt root) it is
 * declared in, so the generated manifest can import the class from its module.
 * Entities sharing a module are grouped into a single import statement, and
 * every imported class is exposed through the `pgEntitiesTypeMap` object, keyed
 * by its class name.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @returns The destination path of the generated manifest template.
 */
export async function registerPgEntityManifest(nuxt: Nuxt): Promise<string> {
  const logger = useLogger(MODULE_NAME)

  // Collect entity source files from the fixed entity patterns.
  const files = await scanEntityPaths(nuxt.options.rootDir)
  logger.info(`Scanned ${files.length} entity file(s) from entity paths`)

  // Resolve each entity class statically (via the TypeScript compiler API) into
  // its validated metadata. Files that fail to parse are skipped with a warning
  // so a single bad entity does not abort the whole build.
  //
  // Each entity also records its class name and the module it is declared in,
  // expressed relative to the Nuxt root (with a leading `/` and POSIX
  // separators) so the runtime can resolve it through `import.meta.glob`.
  const entities: EntityMetadata[] = parsePgEntities(files, {
    skipInvalid: true,
    resolveModulePath: file => `/${relative(nuxt.options.rootDir, file).split(sep).join('/')}`,
  })
  for (const entity of entities) {
    logger.info(`Resolved entity table "${entity.table}" (class ${entity.className}, module ${entity.modulePath})`)
  }

  // One import statement per declaring module, plus a map that binds every
  // className to the class imported from its module. The runtime types come
  // from the ambient `declare module` declarations in `src/runtime/types.d.ts`.
  const imports = collectPgEntityImports(entities)
  const importLines = toPgEntityImportLines(imports)

  const manifest = addTemplate({
    filename: 'pg.entities.manifest.ts',
    write: true,
    // The template is written into the Nuxt build directory (which lives under
    // `node_modules` by default), so rollup skips the TypeScript transform on
    // it. Emit plain JavaScript — the runtime types come from the ambient
    // `declare module` declarations in `src/runtime/types.d.ts`.
    getContents: () =>
      [
        '// This file is auto-generated by @opencowstudio/nuxt-pg. Do not edit manually.',
        '',
        ...importLines,
        ...(importLines.length > 0 ? [''] : []),
        `export const pgEntitiesMetadata = ${toTsLiteral(entities)}`,
        '',
        `export const pgEntitiesTypeMap = ${toPgEntitiesTypeMapLiteral(imports)}`,
        '',
      ].join('\n'),
  })

  // Expose the entity manifest via alias. Nuxt forwards `nuxt.options.alias`
  // into the Nitro build, so the server plugin can resolve `#pg-entities-manifest`.
  nuxt.options.alias[PG_ENTITIES_MANIFEST_ALIAS] = manifest.dst
  return manifest.dst
}
