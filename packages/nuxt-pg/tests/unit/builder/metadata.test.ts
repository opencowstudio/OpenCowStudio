import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPgConfigMetadata } from '../../../src/builder/metadata'
import { samplePgConfigYaml } from '../../fixtures/pg-config'

let dir: string | null = null

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = null
  }
})

function makeTempDir(): string {
  dir = mkdtempSync(join(tmpdir(), 'nuxt-pg-meta-'))
  return dir
}

describe('loadPgConfigMetadata', () => {
  it('reads and parses an existing config file', () => {
    const root = makeTempDir()
    writeFileSync(join(root, 'pg.config.yaml'), samplePgConfigYaml)
    const cfg = loadPgConfigMetadata(root, 'pg.config.yaml')
    expect(cfg).not.toBeNull()
    expect(cfg!.pool.max).toBe(18)
    expect(cfg!.databases.default.master.username).toBe('postgres')
  })

  it('returns null when no config file is present', () => {
    const root = makeTempDir()
    expect(loadPgConfigMetadata(root, 'pg.config.yaml')).toBeNull()
  })
})
