import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Nuxt } from 'nuxt/schema'

vi.mock('@nuxt/kit', () => ({
  addTemplate: vi.fn(() => ({ dst: '/virtual/pg.entities.manifest.ts' })),
  useLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
}))

import { addTemplate } from '@nuxt/kit'
import { registerPgEntityManifest, PG_ENTITIES_MANIFEST_ALIAS } from '../../src/builder/manifest'

// Create the temp root inside the package so the dynamically imported entity
// files can resolve `@opencowstudio/pg-core` and Vite can transform them.
const PKG_ROOT = resolve(fileURLToPath(import.meta.url), '../..')
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

function makeNuxt(): Nuxt {
  return { options: { alias: {}, rootDir: dir! } } as unknown as Nuxt
}

const ENTITY_SOURCE = `
import { PgEntity, PgKey, PgColumn } from '@opencowstudio/pg-core'

@PgEntity({ table: 'users' })
export class User {
  @PgKey() id!: string
  @PgColumn({ columnType: 'TEXT' }) name!: string
}
`

describe('registerPgEntityManifest', () => {
  it('registers a template and exposes it via the #pg-entities-manifest alias', async () => {
    mkdirSync(join(dir!, 'server/entities'), { recursive: true })
    writeFileSync(join(dir!, 'server/entities/user.ts'), ENTITY_SOURCE)
    const nuxt = makeNuxt()
    const dst = await registerPgEntityManifest(nuxt, ['server/entities/**/*.ts'])
    expect(dst).toBe('/virtual/pg.entities.manifest.ts')
    expect(addTemplate).toHaveBeenCalledOnce()

    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(opts.filename).toBe('pg.entities.manifest.ts')
    expect(opts.write).toBe(true)
    expect(nuxt.options.alias[PG_ENTITIES_MANIFEST_ALIAS]).toBe(dst)
  })

  it('serializes scanned entities into a formatted JSON string', async () => {
    mkdirSync(join(dir!, 'server/entities'), { recursive: true })
    writeFileSync(join(dir!, 'server/entities/user.ts'), ENTITY_SOURCE)
    await registerPgEntityManifest(makeNuxt(), ['server/entities/**/*.ts'])

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
