import { describe, it, expect } from 'vitest'
import { FilterBuilder, SortBuilder } from '../../src'
import { PgTableRepository } from '../../src/runtime/table-repository'
import type { FilterCondition, SortCondition } from '../../src'
import type { StoreProxy } from '../../src/runtime/store'
import { entityWith } from '../fixtures/metadata'

// Guards the pagination policy documented on `runtime/table-repository.ts`:
// `findPage` normalises a 1-based page number and a page size, reads the total
// first, reads the page only when something matches, and translates the page
// number into the `from` the store speaks.

type Row = Record<string, unknown>

/** The arguments each primitive of a page read was called with. */
interface Attempts {
  count: Array<FilterCondition | null | undefined>
  findMany: Array<{
    size: number
    from: number
    filter?: FilterCondition | null
    sort?: SortCondition | null
  }>
}

/** Build a store over `rows` reporting `total`, recording how it is queried. */
function fakeStore(rows: Row[], total: number): { store: StoreProxy<Row>; attempts: Attempts } {
  const attempts: Attempts = { count: [], findMany: [] }

  const store: StoreProxy<Row> = {
    insert: async row => row,
    update: async row => row,
    delete: async () => true,
    findById: async () => null,
    count: async (filter) => {
      attempts.count.push(filter)
      return total
    },
    findMany: async (size, from, filter, sort) => {
      attempts.findMany.push({ size, from, filter, sort })
      return rows
    },
    getMetadata: () => entityWith([]),
  }

  return { store, attempts }
}

describe('PgTableRepository.findPage', () => {
  it('reads the total first, then the page, and returns converted entities', async () => {
    const createdAt = new Date(0)
    const { store, attempts } = fakeStore([{ id: 'a', created_at: createdAt }], 11)

    const page = await new PgTableRepository<Row>(store).findPage(3, 5)

    expect(page).toEqual({
      total: 11,
      page: 3,
      size: 5,
      items: [{ id: 'a', createdAt }],
    })
    expect(attempts.count).toEqual([undefined])
    expect(attempts.findMany).toEqual([{ size: 5, from: 10, filter: undefined, sort: undefined }])
  })

  it('skips the page read when nothing matches', async () => {
    const { store, attempts } = fakeStore([], 0)

    const page = await new PgTableRepository<Row>(store).findPage(4, 20)

    expect(page).toEqual({ total: 0, page: 4, size: 20, items: [] })
    expect(attempts.findMany).toEqual([])
  })

  it('passes the filter and the sort to the count and to the page', async () => {
    const filter = FilterBuilder.equals('status', 'open').build()
    const sort = SortBuilder.column('created_at').desc().build()
    const { store, attempts } = fakeStore([], 3)

    await new PgTableRepository<Row>(store).findPage(2, 10, filter, sort)

    expect(attempts.count).toEqual([filter])
    expect(attempts.findMany).toEqual([{ size: 10, from: 10, filter, sort }])
  })

  it('falls back to the first page when the page number is out of range', async () => {
    const invalidPages = [0, -1, 1.5, 10_001, Number.NaN, Number.POSITIVE_INFINITY]

    for (const page of invalidPages) {
      const { store, attempts } = fakeStore([], 5)

      const result = await new PgTableRepository<Row>(store).findPage(page, 10)

      expect(result.page).toBe(1)
      expect(attempts.findMany[0]).toMatchObject({ from: 0 })
    }
  })

  it('accepts the page bounds and computes the position from the page number', async () => {
    const { store, attempts } = fakeStore([], 5)

    const result = await new PgTableRepository<Row>(store).findPage(10_000, 1000)

    expect(result).toMatchObject({ page: 10_000, size: 1000 })
    expect(attempts.findMany[0]).toMatchObject({ size: 1000, from: 9_999_000 })
  })

  it('accepts a page size in [1, 1000] and falls back outside it', async () => {
    const accepted = [1, 1000]
    const rejected = [0, -5, 2.5, 1001, Number.NaN]

    for (const size of accepted) {
      const { store, attempts } = fakeStore([], 5)

      const result = await new PgTableRepository<Row>(store).findPage(1, size)

      expect(result.size).toBe(size)
      expect(attempts.findMany[0]).toMatchObject({ size })
    }

    for (const size of rejected) {
      const { store, attempts } = fakeStore([], 5)

      const result = await new PgTableRepository<Row>(store).findPage(1, size)

      expect(result.size).toBe(100)
      expect(attempts.findMany[0]).toMatchObject({ size: 100 })
    }
  })
})
