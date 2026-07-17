import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Nuxt } from 'nuxt/schema'
import type { PgConfigMetadata } from '@opencowstudio/pg-core'

vi.mock('@nuxt/kit', () => ({
  addTemplate: vi.fn(() => ({ dst: '/virtual/pg.manifest.ts' })),
}))

import { addTemplate } from '@nuxt/kit'
import { registerPgManifest, PG_MANIFEST_ALIAS } from '../../../src/builder/manifest'
import { samplePgConfig } from '../../fixtures/pg-config'

function makeNuxt(): Nuxt {
  return { options: { alias: {} } } as unknown as Nuxt
}

// Reset the shared `addTemplate` mock call history before each test so that
// `mock.calls[0]` always refers to the current test's invocation.
beforeEach(() => {
  vi.clearAllMocks()
})

describe('registerPgManifest', () => {
  it('registers a template and exposes it via the #pg-manifest alias', () => {
    const nuxt = makeNuxt()
    const dst = registerPgManifest(nuxt, samplePgConfig)
    expect(dst).toBe('/virtual/pg.manifest.ts')
    expect(addTemplate).toHaveBeenCalledOnce()

    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(opts.filename).toBe('pg.manifest.ts')
    expect(opts.write).toBe(true)
    expect(nuxt.options.alias[PG_MANIFEST_ALIAS]).toBe(dst)
  })

  it('serializes the config into the generated manifest contents', () => {
    makeNuxt()
    registerPgManifest(makeNuxt(), samplePgConfig)
    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    const contents = opts.getContents()
    expect(contents).toContain('export const pgConfig')
    expect(contents).toContain('postgresql://localhost:5432/opencowstudio_dev')
  })

  it('serializes a null config when no pg file is present', () => {
    makeNuxt()
    registerPgManifest(makeNuxt(), null)
    const opts = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(opts.getContents()).toContain('= null')
  })
})
