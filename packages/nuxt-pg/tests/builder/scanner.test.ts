import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findPgConfigFile } from '../../src/builder/scanner'

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
