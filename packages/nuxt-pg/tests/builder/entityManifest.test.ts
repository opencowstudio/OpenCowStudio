import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Nuxt } from 'nuxt/schema'

vi.mock('@nuxt/kit', () => ({
  addTemplate: vi.fn(() => ({ dst: '/virtual/pg.entities.manifest.ts' })),
  useLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
}))

import { addTemplate } from '@nuxt/kit'
import { registerPgEntityManifest, PG_ENTITIES_MANIFEST_ALIAS } from '../../src/builder/manifest'

// Resolve to the package root (test file lives in tests/builder, so three
// levels up) so the temp root scanned by each test shares the package's
// `node_modules` and the entity source can resolve `@opencowstudio/pg-core`.
const PKG_ROOT = resolve(fileURLToPath(import.meta.url), '../../..')

// The User entity is kept as a static fixture under `tests/fixtures/entities`,
// but a scan never reads anything under `tests/`, so each test copies the
// fixture into the `server/entities/` directory of its own temp root — the
// fixed location the scanner looks at.
const ENTITY_FIXTURE = join(PKG_ROOT, 'tests/fixtures/entities/user.ts')

// Temp Nuxt root used by every test.
let dir: string | null = null

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = null
  }
})

// Reset the shared `addTemplate` mock call history before each test so that
// `mock.calls[0]` always refers to the current test's invocation.
beforeEach(() => {
  vi.clearAllMocks()
  dir = mkdtempSync(join(PKG_ROOT, '.entity-scan-'))
})

/** Copy the User fixture into `<rootDir>/server/entities/user.ts`. */
function writeEntity(rootDir: string): void {
  const entitiesDir = join(rootDir, 'server/entities')
  mkdirSync(entitiesDir, { recursive: true })
  writeFileSync(join(entitiesDir, 'user.ts'), readFileSync(ENTITY_FIXTURE, 'utf8'))
}

function makeNuxt(rootDir: string = dir!): Nuxt {
  return { options: { alias: {}, rootDir } } as unknown as Nuxt
}

describe('registerPgEntityManifest', () => {
  it('registers a template and exposes it via the #pg-entities-manifest alias', async () => {
    writeEntity(dir!)
    const nuxt = makeNuxt()
    const dst = await registerPgEntityManifest(nuxt)
    expect(dst).toBe('/virtual/pg.entities.manifest.ts')
    expect(addTemplate).toHaveBeenCalledOnce()

    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(opts.filename).toBe('pg.entities.manifest.ts')
    expect(opts.write).toBe(true)
    expect(nuxt.options.alias[PG_ENTITIES_MANIFEST_ALIAS]).toBe(dst)
  })

  it('serializes scanned entities into a formatted JSON string', async () => {
    writeEntity(dir!)
    await registerPgEntityManifest(makeNuxt())

    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    const contents = opts.getContents()
    expect(contents).toContain('export const pgEntitiesJson')
    // The embedded JSON string carries the entity's resolved metadata.
    expect(contents).toContain('dbName')
    expect(contents).toContain('columns')
    expect(contents).toContain('users')
    // Each entity records its class name and the module path `import.meta.glob`
    // resolves at runtime, expressed relative to the Nuxt root.
    expect(contents).toContain('className')
    expect(contents).toContain('modulePath')
    expect(contents).toContain('/server/entities/user.ts')
  })

  it('writes an empty array string when no entities match', async () => {
    await registerPgEntityManifest(makeNuxt())
    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    const contents = opts.getContents()
    expect(contents).toContain('"[]"')
  })
})
