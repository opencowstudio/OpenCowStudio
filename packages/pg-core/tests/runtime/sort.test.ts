import { describe, it, expect } from 'vitest'
import { SortBuilder } from '../../src'
import type { PgSortCondition } from '../../src'

// Guards the contract documented on `runtime/sort.ts`: `SortBuilder` is the
// single entry point, each shape has a chainable immutable builder, `name` is
// required and the direction defaults to `ASC`.

describe('SortBuilder', () => {
  it('builds a single-column sort, defaulting the direction to ASC', () => {
    expect(SortBuilder.column('created_at').build()).toEqual({
      kind: 'column',
      name: 'created_at',
      order: 'ASC',
    })
  })

  it('accepts the direction up front', () => {
    expect(SortBuilder.column('created_at', 'DESC').build()).toEqual({
      kind: 'column',
      name: 'created_at',
      order: 'DESC',
    })
  })

  it('changes the direction through desc() and order()', () => {
    expect(SortBuilder.column('name').desc().build().order).toBe('DESC')
    expect(SortBuilder.column('name').desc().asc().build().order).toBe('ASC')
    expect(SortBuilder.column('name').order('DESC').build().order).toBe('DESC')
  })

  it('builds a multi-column sort in insertion order', () => {
    expect(SortBuilder.multiColumn().desc('score').asc('name').build()).toEqual({
      kind: 'multi-column',
      sorts: [
        { kind: 'column', name: 'score', order: 'DESC' },
        { kind: 'column', name: 'name', order: 'ASC' },
      ],
    })
  })

  it('seeds a multi-column sort with already-built sorts and appends to them', () => {
    const seed = SortBuilder.column('score').desc().build()

    expect(SortBuilder.multiColumn(seed).column('name').build().sorts).toEqual([
      seed,
      { kind: 'column', name: 'name', order: 'ASC' },
    ])
  })

  it('mutates the single-column builder in place, so it can be re-pointed', () => {
    const builder = SortBuilder.column('name')

    expect(builder.desc()).toBe(builder)
    expect(builder.build().order).toBe('DESC')

    expect(builder.asc()).toBe(builder)
    expect(builder.build().order).toBe('ASC')

    expect(builder.order('DESC')).toBe(builder)
    expect(builder.build().order).toBe('DESC')
  })

  it('appends columns to the same multi-column builder', () => {
    const builder = SortBuilder.multiColumn().asc('tenant')

    expect(builder.desc('score')).toBe(builder)
    expect(builder.build().sorts.map(entry => entry.name)).toEqual(['tenant', 'score'])
  })

  it('snapshots the state in build(), so later changes do not affect built values', () => {
    const columnBuilder = SortBuilder.column('name')
    const builtSort = columnBuilder.desc().build()

    columnBuilder.asc()
    expect(builtSort.order).toBe('DESC')

    const multiBuilder = SortBuilder.multiColumn().asc('a')
    const builtMulti = multiBuilder.build()

    multiBuilder.desc('b')
    expect(builtMulti.sorts).toHaveLength(1)
    expect(builtMulti.sorts).not.toBe(multiBuilder.build().sorts)
  })

  it('narrows a PgSortCondition on its kind', () => {
    const conditions: PgSortCondition[] = [
      SortBuilder.column('name').build(),
      SortBuilder.multiColumn().desc('score').asc('name').build(),
    ]

    const names = conditions.map(condition =>
      condition.kind === 'multi-column'
        ? condition.sorts.map(entry => entry.name).join(',')
        : condition.name,
    )

    expect(names).toEqual(['name', 'score,name'])
  })
})
