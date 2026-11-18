import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import {
  DEFAULT_API_DIR,
  normalizeApiDir,
  resolveApiSchemaDir,
  scanApiControllerPaths,
  scanApiSchemaPaths,
} from '../../src/builder/scanner'

let dir: string | null = null

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nuxt-api-scanner-'))
})

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = null
  }
})

/** Create an empty file at `relativePath` below the temporary root. */
function touch(relativePath: string): void {
  const file = join(dir!, relativePath)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, '')
}

/** Root-relative POSIX paths of the scan result. */
function scanned(files: string[]): string[] {
  return files.map(file => relative(dir!, file).split(sep).join('/')).sort()
}

describe('normalizeApiDir', () => {
  it('removes a leading ./ and trailing slashes', () => {
    expect(normalizeApiDir('./server/apis/')).toBe('server/apis')
  })

  it('falls back to the default directory when empty', () => {
    expect(normalizeApiDir('')).toBe(DEFAULT_API_DIR)
  })
})

describe('resolveApiSchemaDir', () => {
  it('defaults to the schemas directory inside the controller directory', () => {
    expect(resolveApiSchemaDir('server/apis')).toBe('server/apis/schemas')
  })

  it('normalises the controller directory before deriving', () => {
    expect(resolveApiSchemaDir('./server/apis/')).toBe('server/apis/schemas')
  })

  it('falls back to the default controller directory when empty', () => {
    expect(resolveApiSchemaDir('')).toBe(`${DEFAULT_API_DIR}/schemas`)
  })
})

describe('scanApiSchemaPaths', () => {
  it('collects every .ts file below the schema directory', async () => {
    touch('server/apis/schemas/user.ts')
    touch('server/apis/schemas/nested/group.ts')
    touch('server/apis/user.ts')

    expect(scanned(await scanApiSchemaPaths(dir!, resolveApiSchemaDir('server/apis')))).toEqual([
      'server/apis/schemas/nested/group.ts',
      'server/apis/schemas/user.ts',
    ])
  })
})

describe('scanApiControllerPaths', () => {
  it('collects every .ts file below the api directory', async () => {
    touch('server/apis/user.ts')
    touch('server/apis/nested/post.ts')
    touch('server/other/ignored.ts')

    expect(scanned(await scanApiControllerPaths(dir!))).toEqual([
      'server/apis/nested/post.ts',
      'server/apis/user.ts',
    ])
  })

  it('skips tests and declaration files', async () => {
    touch('server/apis/user.ts')
    touch('server/apis/user.test.ts')
    touch('server/apis/user.spec.ts')
    touch('server/apis/types.d.ts')
    touch('server/apis/tests/fixture.ts')

    expect(scanned(await scanApiControllerPaths(dir!))).toEqual(['server/apis/user.ts'])
  })

  it('honours a custom directory', async () => {
    touch('app/controllers/user.ts')
    touch('server/apis/user.ts')

    expect(scanned(await scanApiControllerPaths(dir!, 'app/controllers'))).toEqual([
      'app/controllers/user.ts',
    ])
  })

  it('returns an empty list when the directory does not exist', async () => {
    expect(await scanApiControllerPaths(dir!, 'missing')).toEqual([])
  })
})
