import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Nuxt } from 'nuxt/schema'

vi.mock('@nuxt/kit', () => ({
  addTemplate: vi.fn(() => ({ dst: '/virtual/api.manifest.ts' })),
  useLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
}))

import { addTemplate } from '@nuxt/kit'
import {
  API_MANIFEST_ALIAS,
  collectApiControllerImports,
  registerApiManifest,
  toApiControllerImportPath,
} from '../../src/builder/manifest'
import { controllerSource } from '../fixtures/controller-source'

let dir: string | null = null

function makeNuxt(): Nuxt {
  return { options: { alias: {}, rootDir: dir! } } as unknown as Nuxt
}

/** Write the fixture controller module below the temporary Nuxt root. */
function writeController(relativePath = 'server/apis/user.ts'): void {
  const file = join(dir!, relativePath)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, controllerSource)
}

/** The generated manifest contents of the current `addTemplate` call. */
function manifestContents(): string {
  const options = (addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
  return options.getContents()
}

beforeEach(() => {
  vi.clearAllMocks()
  dir = mkdtempSync(join(tmpdir(), 'nuxt-api-manifest-'))
})

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = null
  }
})

describe('collectApiControllerImports', () => {
  it('groups controllers declared by the same module', () => {
    const imports = collectApiControllerImports([
      { className: 'UserController', modulePath: '/server/apis/user.ts' } as never,
      { className: 'AdminController', modulePath: '/server/apis/user.ts' } as never,
      { className: 'PostController', modulePath: '/server/apis/post.ts' } as never,
    ])

    expect(imports).toEqual([
      { modulePath: '/server/apis/user.ts', classNames: ['UserController', 'AdminController'] },
      { modulePath: '/server/apis/post.ts', classNames: ['PostController'] },
    ])
  })
})

describe('toApiControllerImportPath', () => {
  it('addresses root-relative modules through the root alias', () => {
    expect(toApiControllerImportPath('/server/apis/user.ts')).toBe('~~/server/apis/user.ts')
    expect(toApiControllerImportPath('server/apis/user.ts')).toBe('~~/server/apis/user.ts')
  })
})

describe('registerApiManifest', () => {
  it('registers a template and exposes it via the #api-manifest alias', async () => {
    writeController()
    const nuxt = makeNuxt()

    const { dst, controllers } = await registerApiManifest(nuxt, 'server/apis', '/api')

    expect(dst).toBe('/virtual/api.manifest.ts')
    expect(controllers.map(controller => controller.className)).toEqual(['UserController'])
    expect(addTemplate).toHaveBeenCalledOnce()
    expect((addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0].filename).toBe('api.manifest.ts')
    expect((addTemplate as ReturnType<typeof vi.fn>).mock.calls[0]![0].write).toBe(true)
    expect(nuxt.options.alias[API_MANIFEST_ALIAS]).toBe(dst)
  })

  it('bakes the controller metadata, its import and the type map', async () => {
    writeController()
    await registerApiManifest(makeNuxt(), 'server/apis', '/api')
    const contents = manifestContents()

    expect(contents).toContain("import { UserController } from '~~/server/apis/user.ts'")
    expect(contents).toContain("export const apiPrefix = '/api'")
    expect(contents).toContain('export const apiControllersMetadata = [')
    expect(contents).toContain("  className: 'UserController',")
    expect(contents).toContain("  path: '/',")
    expect(contents).toContain("  path: '/users/:id',")
    expect(contents).toContain('  methods: [')
    expect(contents).toContain("    'GET',")
    expect(contents).toContain("    'POST',")
    expect(contents).toContain("  handler: 'show',")
    expect(contents).toContain('export const apiControllersTypeMap = {')
    expect(contents).toContain('  UserController: UserController,')
    // The metadata is embedded as a TS object literal, not a JSON string.
    expect(contents).not.toContain('"className"')
  })

  it('normalises the configured prefix', async () => {
    writeController()
    await registerApiManifest(makeNuxt(), 'server/apis', 'api/')
    expect(manifestContents()).toContain("export const apiPrefix = '/api'")
  })

  it('bakes an empty manifest when no controller file is found', async () => {
    await registerApiManifest(makeNuxt(), 'server/apis', '/api')
    const contents = manifestContents()

    expect(contents).toContain('export const apiControllersMetadata = []')
    expect(contents).toContain('export const apiControllersTypeMap = {}')
    expect(contents).not.toContain('import {')
  })
})
