import { relative, sep } from 'node:path'
import { addTemplate, useLogger } from '@nuxt/kit'
import type { Nuxt } from 'nuxt/schema'
import { normalizeApiPath } from '@opencowstudio/api-core'
import type { ApiControllerMetadata } from '@opencowstudio/api-core'
import { parseApiControllers } from '@opencowstudio/api-core/builder'
import { toTsLiteral } from './codegen'
import { normalizeApiDir, resolveApiSchemaDir, scanApiControllerPaths, scanApiSchemaPaths } from './scanner'

const MODULE_NAME = '@opencowstudio/nuxt-api'

/** Alias under which the generated manifest is exposed to the runtime. */
export const API_MANIFEST_ALIAS = '#api-manifest'

/** Nuxt alias of the project root, used to address controller modules. */
const ROOT_ALIAS = '~~'

/** The outcome of {@link registerApiManifest}. */
export interface ApiManifestResult {
  /** Destination path of the generated manifest template. */
  dst: string
  /** Controllers resolved from the scanned sources. */
  controllers: ApiControllerMetadata[]
}

/**
 * The controller classes declared by a single module, i.e. the metadata needed
 * to emit one `import` statement in the generated manifest.
 */
export interface ApiControllerImportMetadata {
  /**
   * Path of the module declaring the classes, as recorded in the controller
   * metadata: relative to the Nuxt root with a leading `/` (e.g.
   * `/server/apis/user.ts`).
   */
  modulePath: string
  /** Class names declared in that module, in discovery order. */
  classNames: string[]
}

/**
 * Group the controller metadata by declaring module, so every module yields
 * exactly one import statement carrying all of its controller classes.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @param controllers The resolved controller metadata.
 */
export function collectApiControllerImports(
  controllers: ApiControllerMetadata[],
): ApiControllerImportMetadata[] {
  const byModule = new Map<string, string[]>()

  for (const { modulePath, className } of controllers) {
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
 * Turn a recorded module path into the specifier used by the generated
 * manifest. The path is root-relative, so it is addressed through the root
 * alias instead of the `~`/`@` alias (which points at the source directory).
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @param modulePath Root-relative module path, e.g. `/server/apis/user.ts`.
 */
export function toApiControllerImportPath(modulePath: string): string {
  return `${ROOT_ALIAS}${modulePath.startsWith('/') ? modulePath : `/${modulePath}`}`
}

/** Emit one import statement per module, listing all of its controller classes. */
function toApiControllerImportLines(imports: ApiControllerImportMetadata[]): string[] {
  return imports.map(
    ({ modulePath, classNames }) => `import { ${classNames.join(', ')} } from '${toApiControllerImportPath(modulePath)}'`,
  )
}

/**
 * Emit the className -> imported class map, so the runtime can instantiate the
 * controller classes by the names recorded in the metadata.
 */
function toApiControllerTypeMapLiteral(imports: ApiControllerImportMetadata[]): string {
  const classNames = imports.flatMap(({ classNames }) => classNames)
  if (classNames.length === 0) return '{}'

  const entries = classNames.map(className => `  ${className}: ${className},`)
  return `{\n${entries.join('\n')}\n}`
}

/**
 * Scan the controller source files, resolve every discovered class into an
 * `ApiControllerMetadata` by parsing its decorators statically (no module
 * import, no class instantiation), and bake that typed collection into a
 * server-only manifest at build time.
 *
 * Besides the decorator-derived metadata, every controller records its class
 * name and the module path (relative to the Nuxt root) it is declared in, so
 * the generated manifest can import the class from its module. Controllers
 * sharing a module are grouped into a single import statement, and every
 * imported class is exposed through `apiControllersTypeMap`, keyed by its class
 * name.
 *
 * The mount prefix is baked into the same manifest, so the generated Nitro
 * handlers and the generated route table cannot disagree on it.
 *
 * Build-time only — this helper must never be imported from the runtime.
 *
 * @returns The manifest destination plus the controllers it was built from, so
 *          the caller can register one Nitro handler per route without scanning
 *          the sources twice.
 */
export async function registerApiManifest(
  nuxt: Nuxt,
  dir: string,
  prefix: string,
): Promise<ApiManifestResult> {
  const logger = useLogger(MODULE_NAME)

  // Collect controller source files from the configured directory.
  const files = await scanApiControllerPaths(nuxt.options.rootDir, dir)
  logger.info(`Scanned ${files.length} api controller file(s) from "${normalizeApiDir(dir)}"`)

  // Collect the input / output schema files. They are imported (not parsed): a
  // schema is a runtime value, and its export name is the type name a handler
  // declares. They always live in the `schemas` directory inside `dir`.
  const schemaDir = resolveApiSchemaDir(dir)
  const schemaFiles = await scanApiSchemaPaths(nuxt.options.rootDir, schemaDir)
  logger.info(`Scanned ${schemaFiles.length} api schema file(s) from "${schemaDir}"`)

  // Resolve each controller class statically (via the TypeScript compiler API)
  // into its validated metadata. Files that fail to parse are skipped with a
  // warning so a single bad controller does not abort the whole build.
  //
  // Each controller also records its class name and the module it is declared
  // in, expressed relative to the Nuxt root (with a leading `/` and POSIX
  // separators) so the generated import resolves through the `~~` alias.
  const controllers = parseApiControllers(files, {
    skipInvalid: true,
    resolveModulePath: file => `/${relative(nuxt.options.rootDir, file).split(sep).join('/')}`,
  })
  for (const controller of controllers) {
    logger.info(
      `Resolved api controller "${controller.name}" (class ${controller.className}, routes: ${controller.routes.length}, module ${controller.modulePath})`,
    )
  }

  // One import statement per declaring module, plus a map that binds every
  // className to the class imported from its module. The runtime types come
  // from the ambient `declare module` declarations in `src/runtime/types.d.ts`.
  const imports = collectApiControllerImports(controllers)
  const importLines = toApiControllerImportLines(imports)

  // Every schema module is imported as a namespace and spread into one registry,
  // so a schema export name is what a handler parameter type must be called.
  const schemaModules = schemaFiles.map((file, index) => ({
    alias: `apiSchemas${index}`,
    modulePath: `/${relative(nuxt.options.rootDir, file).split(sep).join('/')}`,
  }))
  const schemaImportLines = schemaModules.map(
    ({ alias, modulePath }) => `import * as ${alias} from '${toApiControllerImportPath(modulePath)}'`,
  )
  const schemaRegistryLiteral = schemaModules.length === 0
    ? '{}'
    : `{ ${schemaModules.map(({ alias }) => `...${alias}`).join(', ')} }`

  const manifest = addTemplate({
    filename: 'api.manifest.ts',
    write: true,
    // The template is written into the Nuxt build directory (which lives under
    // `node_modules` by default), so rollup skips the TypeScript transform on
    // it. Emit plain JavaScript — the runtime types come from the ambient
    // `declare module` declarations in `src/runtime/types.d.ts`.
    getContents: () =>
      [
        '// This file is auto-generated by @opencowstudio/nuxt-api. Do not edit manually.',
        '',
        ...importLines,
        ...schemaImportLines,
        ...(importLines.length + schemaImportLines.length > 0 ? [''] : []),
        `export const apiPrefix = ${toTsLiteral(normalizeApiPath(prefix))}`,
        '',
        `export const apiControllersMetadata = ${toTsLiteral(controllers)}`,
        '',
        `export const apiControllersTypeMap = ${toApiControllerTypeMapLiteral(imports)}`,
        '',
        `export const apiSchemas = ${schemaRegistryLiteral}`,
        '',
      ].join('\n'),
  })

  // Expose the manifest via alias. Nuxt forwards `nuxt.options.alias` into the
  // Nitro build, so the server plugin can resolve `#api-manifest` as well.
  nuxt.options.alias[API_MANIFEST_ALIAS] = manifest.dst
  return { dst: manifest.dst, controllers }
}
