import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Guards the module layering documented in `src/index.ts`:
//
//   builder/ -> shared/ <- runtime/
//
// Dependencies flow one way only. The runtime entry may reach exactly ONE file
// inside `builder/` (`decorators.ts`, the value markers); everything else in
// `builder/` — above all `parser.ts`, which imports the TypeScript compiler API —
// must stay out of the runtime graph.

const srcDir = fileURLToPath(new URL('../src/', import.meta.url))

/** All `.ts` files under `src/<dir>`, as absolute paths. */
function filesUnder(dir: string): string[] {
  return readdirSync(join(srcDir, dir), { recursive: true, encoding: 'utf8' })
    .filter(entry => entry.endsWith('.ts'))
    .map(entry => join(srcDir, dir, entry))
}

/** Every `.ts` file under `src/`, as absolute paths. */
function allSrcFiles(): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .filter(entry => entry.endsWith('.ts'))
    .map(entry => join(srcDir, entry))
}

/** Every module specifier imported or re-exported by a file. */
function specifiersOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map(match => match[1]!)
}

/** Files under `src/<dir>` importing a specifier that matches `pattern`. */
function offenders(dir: string, pattern: RegExp): string[] {
  return filesUnder(dir)
    .filter(file => specifiersOf(file).some(specifier => pattern.test(specifier)))
    .map(file => relative(srcDir, file))
}

/** Matches a relative import pointing at `layer/`. */
const importsLayer = (layer: string) => new RegExp(`(^|/)\\.\\.?/${layer}(/|$)`)

describe('architecture — module layering', () => {
  it('shared must not depend on typescript, pg, builder or runtime', () => {
    // `shared/` is the pure type contract imported by both stages, so it must
    // stay free of every heavy or stage-specific dependency.
    expect(offenders('shared', /^typescript$|^pg$/)).toEqual([])
    expect(offenders('shared', importsLayer('builder'))).toEqual([])
    expect(offenders('shared', importsLayer('runtime'))).toEqual([])
  })

  it('builder must not import the runtime layer or pg', () => {
    expect(offenders('builder', importsLayer('runtime'))).toEqual([])
    expect(offenders('builder', /^pg$/)).toEqual([])
  })

  it('runtime must not import the build-time layer or typescript', () => {
    expect(offenders('runtime', importsLayer('builder'))).toEqual([])
    expect(offenders('runtime', /^typescript$/)).toEqual([])
  })

  it('only builder/parser.ts may import the TypeScript compiler API', () => {
    const importers = allSrcFiles()
      .filter(file => specifiersOf(file).some(specifier => specifier === 'typescript'))
      .map(file => relative(srcDir, file))
    expect(importers).toEqual([join('builder', 'parser.ts')])
  })

  it('the runtime entry may only reach builder/decorators inside builder', () => {
    const entry = join(srcDir, 'index.ts')
    const builderSpecifiers = specifiersOf(entry).filter(specifier => /builder/.test(specifier))
    expect(builderSpecifiers).toEqual(['./builder/decorators'])
  })
})
