import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
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
// levels up) so the scanner reads fixtures and resolves `@opencowstudio/pg-core`.
const PKG_ROOT = resolve(fileURLToPath(import.meta.url), '../../..')

// The User entity lives as a static fixture under `tests/fixtures/entities` so
// the scanner can read it directly — no temporary file is written per test.
const ENTITY_FIXTURE_PATTERN = join(PKG_ROOT, 'tests/fixtures/entities/**/*.ts')

// Temp root used only for the "no entities" case, so its scan matches nothing.
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

function makeNuxt(rootDir: string = dir!): Nuxt {
  return { options: { alias: {}, rootDir } } as unknown as Nuxt
}

describe('registerPgEntityManifest', () => {
  it('registers a template and exposes it via the #pg-entities-manifest alias', async () => {
    const nuxt = makeNuxt(PKG_ROOT)
    const dst = await registerPgEntityManifest(nuxt, [ENTITY_FIXTURE_PATTERN])
    expect(dst).toBe('/virtual/pg.entities.manifest.ts')
    expect(addTemplate).toHaveBeenCalledOnce()

    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(opts.filename).toBe('pg.entities.manifest.ts')
    expect(opts.write).toBe(true)
    expect(nuxt.options.alias[PG_ENTITIES_MANIFEST_ALIAS]).toBe(dst)
  })

  it('serializes scanned entities into a formatted JSON string', async () => {
    await registerPgEntityManifest(makeNuxt(PKG_ROOT), [ENTITY_FIXTURE_PATTERN])

    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    const contents = opts.getContents()
    expect(contents).toContain('export const pgEntitiesJson')
    // The embedded JSON string carries the entity's raw decorator metadata.
    expect(contents).toContain('className')
    expect(contents).toContain('User')
    expect(contents).toContain('users')
  })

  it('writes an empty array string when no entities match', async () => {
    await registerPgEntityManifest(makeNuxt(), ['server/entities/**/*.ts'])
    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    const contents = opts.getContents()
    expect(contents).toContain('"[]"')
  })
})
