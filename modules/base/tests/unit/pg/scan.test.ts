import { describe, it, expect } from 'vitest'
import {
  PgEntity,
  PgKey,
  PgColumn,
  getPgEntityMetadata,
  getAllPgEntityMetadata,
  scanPgEntities,
} from '../../../src/pg'

// Entities self-register into the module registry when this file is imported.
@PgEntity({ table: 'members', schema: 'public' })
class Member {
  @PgKey({ generated: true })
  id!: string

  @PgColumn({ columnType: 'TEXT' })
  name!: string

  @PgColumn({ columnType: 'DATE' })
  bornAt!: Date
}

@PgEntity()
class Article {
  @PgKey({ generated: false })
  slug!: string

  @PgColumn({ columnType: 'TEXT' })
  title!: string
}

// Wrap the entities in a fake imported module shape (as import.meta.glob yields).
const entitiesModule = { Member, Article }

describe('Pg entity scanning & lookup', () => {
  it('should build metadata for an entity without manually constructing it', () => {
    const meta = getPgEntityMetadata(Member)
    expect(meta).toBeDefined()
    expect(meta!.table).toBe('members')
    expect(meta!.schema).toBe('public')
    expect(meta!.keys).toHaveLength(1)
    expect(meta!.keys[0]).toMatchObject({ propertyKey: 'id', column: 'id' })
    expect(meta!.columns).toContainEqual({
      propertyKey: 'name',
      column: 'name',
      comment: '',
      columnType: 'TEXT',
    })
  })

  it('should derive table from class name when not provided', () => {
    const meta = getPgEntityMetadata(Article)
    expect(meta!.table).toBe('article')
  })

  it('should return metadata for all scanned modules via scanPgEntities', () => {
    const metas = scanPgEntities([entitiesModule])
    const tables = metas.map(m => m.table).sort()
    expect(tables).toContain('members')
    expect(tables).toContain('article')
  })

  it('should return metadata for all registered entities via getAllPgEntityMetadata', () => {
    const metas = getAllPgEntityMetadata()
    const tables = metas.map(m => m.table).sort()
    expect(tables).toContain('members')
    expect(tables).toContain('article')
  })

  it('should return undefined for a non-entity class', () => {
    class Plain {}
    expect(getPgEntityMetadata(Plain)).toBeUndefined()
  })

  it('should make getPgEntityMetadata idempotent (cached, no repeated construction)', () => {
    const first = getPgEntityMetadata(Member)
    const second = getPgEntityMetadata(Member)
    expect(second).toBe(first)
  })
})
