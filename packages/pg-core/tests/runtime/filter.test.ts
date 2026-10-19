import { describe, it, expect } from 'vitest'
import { FilterBuilder } from '../../src'
import type { FilterCondition } from '../../src'

// Guards the contract documented on `runtime/filter.ts`: `FilterBuilder` is the
// single entry point, each shape has a chainable immutable builder, and `kind`
// tags keep the union narrowable.

describe('FilterBuilder', () => {
  it('builds an equality filter', () => {
    expect(FilterBuilder.equals('status', 'open').build()).toEqual({
      kind: 'equals',
      name: 'status',
      value: 'open',
    })

    expect(FilterBuilder.equals('deleted', false).build().value).toBe(false)
  })

  it('replaces the equality value through value()', () => {
    expect(FilterBuilder.equals('status', 'open').value('closed').build().value).toBe('closed')
  })

  it('builds a set filter and appends values', () => {
    expect(FilterBuilder.anyOf('status', ['open', 'closed']).add('pending').build()).toEqual({
      kind: 'in',
      name: 'status',
      values: ['open', 'closed', 'pending'],
    })

    expect(FilterBuilder.anyOf('status').add('open', 'closed').build().values).toEqual([
      'open',
      'closed',
    ])
  })

  it('builds an inclusive range from the seed', () => {
    expect(FilterBuilder.range('age', { minValue: 18, maxValue: 65 }).build()).toEqual({
      kind: 'range',
      name: 'age',
      minValue: 18,
      maxValue: 65,
      gte: true,
      gt: false,
      lte: true,
      lt: false,
    })
  })

  it('builds a range through the operator methods', () => {
    expect(FilterBuilder.range('age').gte(18).lt(65).build()).toEqual({
      kind: 'range',
      name: 'age',
      minValue: 18,
      maxValue: 65,
      gte: true,
      gt: false,
      lte: false,
      lt: true,
    })

    expect(FilterBuilder.range('age').gt(18).build()).toMatchObject({ gte: false, gt: true })
  })

  it('keeps the operator pairs mutually exclusive', () => {
    const lower = FilterBuilder.range('age').gte(18).gt(21).build()
    expect([lower.minValue, lower.gte, lower.gt]).toEqual([21, false, true])

    const upper = FilterBuilder.range('age').lt(65).lte(60).build()
    expect([upper.maxValue, upper.lte, upper.lt]).toEqual([60, true, false])

    const seeded = FilterBuilder.range('age', { minValue: 18, gte: true, gt: true }).build()
    expect([seeded.gte, seeded.gt]).toEqual([false, true])
  })

  it('leaves an omitted range bound null and its flags false', () => {
    const filter = FilterBuilder.range('created_at')
      .lt(new Date('2026-01-01T00:00:00Z'))
      .build()

    expect(filter.minValue).toBeNull()
    expect([filter.gte, filter.gt]).toEqual([false, false])
    expect([filter.lte, filter.lt]).toEqual([false, true])
  })

  it('builds a string matching filter', () => {
    expect(FilterBuilder.match('name', 'ann%').build()).toEqual({
      kind: 'match',
      name: 'name',
      value: 'ann%',
    })
  })

  it('builds a boolean grouping, defaulting the omitted groups to empty', () => {
    const mustNot = FilterBuilder.equals('deleted', true).build()

    expect(FilterBuilder.bool({ mustNot: [mustNot] }).build()).toEqual({
      kind: 'bool',
      must: [],
      mustNot: [mustNot],
      should: [],
    })
  })

  it('appends to all three groups of a boolean grouping', () => {
    const condition = FilterBuilder.bool()
      .must(FilterBuilder.equals('tenant', 'acme').build(), FilterBuilder.range('age').gte(18).build())
      .mustNot(FilterBuilder.equals('deleted', true).build())
      .should(FilterBuilder.match('name', 'ann%').build())
      .should(FilterBuilder.anyOf('role', ['admin', 'owner']).build())
      .build()

    expect(condition.must.map(entry => entry.kind)).toEqual(['equals', 'range'])
    expect(condition.mustNot.map(entry => entry.kind)).toEqual(['equals'])
    expect(condition.should.map(entry => entry.kind)).toEqual(['match', 'in'])
  })

  it('mutates the equality, match and set builders in place', () => {
    const equalsBuilder = FilterBuilder.equals('status', 'open')
    expect(equalsBuilder.value('closed')).toBe(equalsBuilder)
    expect(equalsBuilder.build().value).toBe('closed')

    const matchBuilder = FilterBuilder.match('name', 'ann%')
    expect(matchBuilder.value('bob%')).toBe(matchBuilder)
    expect(matchBuilder.build().value).toBe('bob%')

    const inBuilder = FilterBuilder.anyOf('status').add('open')
    expect(inBuilder.add('closed')).toBe(inBuilder)
    expect(inBuilder.build().values).toEqual(['open', 'closed'])
  })

  it('re-points range bounds in place', () => {
    const builder = FilterBuilder.range('age').gte(18)

    expect(builder.lt(65)).toBe(builder)
    expect(builder.build()).toMatchObject({
      minValue: 18,
      gte: true,
      maxValue: 65,
      lte: false,
      lt: true,
    })

    expect(builder.gt(21)).toBe(builder)
    expect(builder.build()).toMatchObject({ minValue: 21, gte: false, gt: true, maxValue: 65 })
  })

  it('appends to the same boolean group builder', () => {
    const group = FilterBuilder.bool().must(FilterBuilder.equals('tenant', 'acme').build())

    expect(group.should(FilterBuilder.match('name', 'a%').build())).toBe(group)
    expect(group.build().must).toHaveLength(1)
    expect(group.build().should).toHaveLength(1)
  })

  it('snapshots the state in build(), so later changes do not affect built values', () => {
    const builder = FilterBuilder.anyOf('status').add('open')
    const built = builder.build()

    builder.add('closed')
    expect(built.values).toEqual(['open'])
    expect(built.values).not.toBe(builder.build().values)
  })

  it('narrows a FilterCondition on its kind', () => {
    const conditions: FilterCondition[] = [
      FilterBuilder.equals('name', 'ann').build(),
      FilterBuilder.match('name', 'ann%').build(),
      FilterBuilder.anyOf('role', ['admin']).build(),
      FilterBuilder.range('age').gte(18).build(),
      FilterBuilder.bool().should(FilterBuilder.equals('role', 'owner').build()).build(),
    ]

    const shapes = conditions.map(condition => {
      switch (condition.kind) {
        case 'bool':
          return `bool:${condition.should.length}`
        case 'in':
          return `in:${condition.values.length}`
        case 'range':
          return `range:${condition.minValue}`
        default:
          return `${condition.kind}:${condition.value}`
      }
    })

    expect(shapes).toEqual(['equals:ann', 'match:ann%', 'in:1', 'range:18', 'bool:1'])
  })
})
