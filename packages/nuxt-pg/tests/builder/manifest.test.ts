import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Nuxt } from 'nuxt/schema'

vi.mock('@nuxt/kit', () => ({
  addTemplate: vi.fn(() => ({ dst: '/virtual/pg.manifest.ts' })),
  useLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
}))

import { addTemplate } from '@nuxt/kit'
import { registerPgManifest, PG_MANIFEST_ALIAS } from '../../src/builder/manifest'
import { samplePgConfigYaml } from '../fixtures/pg-config'

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
  dir = mkdtempSync(join(tmpdir(), 'nuxt-pg-manifest-'))
})

function makeNuxt(): Nuxt {
  return { options: { alias: {}, rootDir: dir! } } as unknown as Nuxt
}

describe('registerPgManifest', () => {
  it('registers a template and exposes it via the #pg-manifest alias', () => {
    writeFileSync(join(dir!, 'app.config.yaml'), samplePgConfigYaml)
    const nuxt = makeNuxt()
    const dst = registerPgManifest(nuxt, 'app.config.yaml')
    expect(dst).toBe('/virtual/pg.manifest.ts')
    expect(addTemplate).toHaveBeenCalledOnce()

    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(opts.filename).toBe('pg.manifest.ts')
    expect(opts.write).toBe(true)
    expect(nuxt.options.alias[PG_MANIFEST_ALIAS]).toBe(dst)
  })

  it('serializes the pg namespace into a formatted JSON string', () => {
    writeFileSync(join(dir!, 'app.config.yaml'), samplePgConfigYaml)
    registerPgManifest(makeNuxt(), 'app.config.yaml')
    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    const contents = opts.getContents()
    expect(contents).toContain('export const pgConfigJson')
    // The pg namespace is embedded as a JSON string literal.
    expect(contents).toContain('postgresql://localhost:5432/opencowstudio_dev')
  })

  it('serializes a null JSON string when no config file is present', () => {
    registerPgManifest(makeNuxt(), 'missing.yaml')
    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(opts.getContents()).toContain('= null')
  })
})
