import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { findPgConfigFile, scanEntityPaths } from '../../src/builder/scanner'

let dir: string | null = null

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = null
  }
})

function makeTempDir(): string {
  dir = mkdtempSync(join(tmpdir(), 'nuxt-pg-scanner-'))
  return dir
}

/** Write an empty entity source file at `relativePath` inside `root`. */
function writeEntityFile(root: string, relativePath: string): string {
  const file = join(root, relativePath)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, 'export class Sample {}\n')
  return file
}

describe('findPgConfigFile', () => {
  it('returns the resolved path when the config file exists', () => {
    const root = makeTempDir()
    writeFileSync(join(root, 'app.config.yaml'), 'pg:\n  pool: {}')
    expect(findPgConfigFile(root, 'app.config.yaml')).toBe(join(root, 'app.config.yaml'))
  })

  it('returns null when the config file is missing', () => {
    const root = makeTempDir()
    expect(findPgConfigFile(root, 'missing.yaml')).toBeNull()
  })
})

describe('scanEntityPaths', () => {
  it('returns the absolute path of every entity file it matches', async () => {
    const root = makeTempDir()
    writeEntityFile(root, 'server/entities/user.ts')

    expect(await scanEntityPaths(root)).toEqual([
      join(root, 'server/entities/user.ts'),
    ])
  })

  it('skips entity files living under a tests directory', async () => {
    const root = makeTempDir()
    writeEntityFile(root, 'server/entities/user.ts')
    writeEntityFile(root, 'tests/fixtures/entities/user.ts')

    expect(await scanEntityPaths(root)).toEqual([
      join(root, 'server/entities/user.ts'),
    ])
  })
})
