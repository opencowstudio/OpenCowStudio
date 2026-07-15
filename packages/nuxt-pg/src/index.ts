import { defineNuxtModule, addServerPlugin, createResolver } from '@nuxt/kit'
import { resolve, join } from 'node:path'
import { promises as fs } from 'node:fs'
import { loadPgConfigFromFile } from '@opencowstudio/pg-core'

export { generateGuid, generateId } from '@opencowstudio/pg-core'

export interface ModuleOptions {
  /**
   * Enable or disable the module
   * @default true
   */
  enabled?: boolean
  /**
   * Path (relative to the project root) of the PostgreSQL datasource config
   * file. Defaults to "pg.config.yaml" at the project root. When set, the
   * config is loaded at build time and injected into the server-only runtime
   * config so connection pools can be created by the Nitro plugin.
   * @default "pg.config.yaml"
   */
  pgConfigPath?: string
}

/** Directories that should never be descended into while scanning for entities. */
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', '.git', '.cache', 'dist', 'build'])

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@opencowstudio/nuxt-pg',
    configKey: 'base',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    enabled: true,
    pgConfigPath: 'pg.config.yaml',
  },
  async setup(options, nuxt) {
    if (!options.enabled) {
      return
    }

    // Load the datasource config (if a path is provided) and expose it to the
    // server runtime only — credentials must never reach the client bundle.
    if (options.pgConfigPath) {
      const configPath = resolve(nuxt.options.rootDir, options.pgConfigPath)
      const pgConfig = loadPgConfigFromFile(configPath)
      nuxt.options.runtimeConfig.pg = pgConfig as unknown as Record<string, unknown>
    }

    // Discover every **/entities/*.ts file at build time. We only collect file
    // paths here (no import), so this works in the plain Node/jiti module
    // context. The actual entity files are imported by the generated virtual
    // module below, which Vite/Nitro transforms with native decorator support
    // (unlike jiti, which only supports legacy decorators).
    const entityPaths = await collectEntityPaths(nuxt.options.rootDir)

    const registryCode = [
      ...entityPaths.map((p, i) => `import * as _e${i} from ${JSON.stringify(p)}`),
      `export const entityModules = [${entityPaths.map((_, i) => `_e${i}`).join(', ')}]`,
    ].join('\n')

    const nitroOptions = (nuxt.options as { nitro?: { virtual?: Record<string, string> } }).nitro ?? {}
    nitroOptions.virtual = nitroOptions.virtual ?? {}
    nitroOptions.virtual['#opencowstudio/entities'] = registryCode
    ;(nuxt.options as { nitro?: { virtual?: Record<string, string> } }).nitro = nitroOptions

    const { resolve: resolveRuntime } = createResolver(import.meta.url)
    addServerPlugin(resolveRuntime('./runtime/pg-plugin.ts'))
  },
})

/**
 * Recursively collect every `*.ts` file living inside an `entities/` directory
 * under `rootDir`. Returns absolute paths; the importing (and decorator
 * execution) is left to Vite/Nitro via the generated virtual module.
 */
async function collectEntityPaths(rootDir: string): Promise<string[]> {
  const paths: string[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 25) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    }
    catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || (entry.name.startsWith('.') && SKIP_DIRS.has(entry.name))) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await walk(full, depth + 1)
      }
      else if (entry.isFile() && entry.name.endsWith('.ts') && /(^|[\\/])entities[\\/]/.test(full.slice(rootDir.length))) {
        paths.push(full)
      }
    }
  }

  await walk(rootDir, 0)
  return paths
}
