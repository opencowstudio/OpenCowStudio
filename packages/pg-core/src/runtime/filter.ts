// ---------------------------------------------------------------------------
// Filter conditions (runtime)
//
// A typed description of the predicates a `WHERE` clause is built from. Five
// shapes cover what a statement needs:
//
//   * `PgEqualsFilter` — one column compared to one value.
//   * `PgInFilter`     — one column compared to a set of values.
//   * `PgRangeFilter`  — one column bounded below and/or above.
//   * `PgMatchFilter`  — one column containing a literal string.
//   * `PgBoolFilter`   — a boolean grouping of the other shapes (`must` /
//                        `mustNot` / `should`), nestable.
//
// Unlike the sort conditions, these shapes overlap: a string equality and a
// string match both carry `{ name, value }`, so no structural check can tell
// them apart and the statement layer could not choose `=` over `LIKE`. Every
// filter therefore carries a `kind` tag, and `PgFilterCondition` is a
// discriminated union narrowed on it.
//
// Creation goes through one entry point, `FilterBuilder`, so there is a single
// name to remember:
//
//   FilterBuilder.equals('status', 'open').build()
//   FilterBuilder.anyOf('status', ['open', 'closed']).add('pending').build()
//   FilterBuilder.range('age').gte(18).lt(65).build()
//   FilterBuilder.match('name', 'ann').build()
//   FilterBuilder.bool().must(...).mustNot(...).should(...).build()
//
// Each shape has its own builder. Column names are fixed at construction (the
// only immutable part) and are validated with `assertValidPgName` as they enter
// the builder, while every other setting is mutable: the chainable methods
// update the builder in place and return it, so a value, a bound or a group can
// be re-set without constructing another builder. `build()` snapshots the
// current state into a plain data object: no `pg` import, no SQL and no
// behaviour — rendering a clause belongs to the statement layer
// (`runtime/sql.ts`).
// ---------------------------------------------------------------------------

import { assertValidPgName } from '../shared/naming.ts'

/** Value a range bound can hold: a number or a date. */
export type PgRangeValue = number | Date

/** Equality filter: `column = value`. */
export interface PgEqualsFilter {
  readonly kind: 'equals'
  /**
   * Column to filter on: the property key it is declared under (`createdAt`) or
   * the stored column name (`created_at`). The statement layer resolves the
   * former through the entity metadata and uses any other name as written.
   */
  readonly name: string
  /** Value the column is compared to; any type the column can store. */
  readonly value: unknown
}

/** Value an `in` filter can hold: a number or a string. */
export type PgInValue = number | string

/**
 * Values of an `in` filter: a list of numbers or a list of strings.
 *
 * A list is meant to be homogeneous — the values are compared to one column, so
 * they all share its type — and an empty list matches nothing. The statement
 * layer binds the whole list as one array parameter (`column = ANY($n)`), so a
 * mixed list would fail the array cast of the column type.
 */
export type PgInValues = readonly PgInValue[]

/** Set filter, rendered as `column = ANY($n)` over the value list. */
export interface PgInFilter {
  readonly kind: 'in'
  /**
   * Column to filter on: the property key it is declared under (`createdAt`) or
   * the stored column name (`created_at`). The statement layer resolves the
   * former through the entity metadata and uses any other name as written.
   */
  readonly name: string
  /**
   * Values the column is compared to: numbers for a numeric column, strings for
   * a text one. Empty means the filter matches nothing.
   */
  readonly values: PgInValues
}

/**
 * Range filter on a single column.
 *
 * `minValue` / `maxValue` are the bounds; a `null` bound means the filter is
 * open on that side. `gte` / `gt` select the lower operator (`>=` / `>`) and
 * `lte` / `lt` the upper one (`<=` / `<`). Both flags of a pair start as
 * `false` and are never `true` together, and a flag is never `true` for a bound
 * that is `null`.
 */
export interface PgRangeFilter {
  readonly kind: 'range'
  /**
   * Column to filter on: the property key it is declared under (`createdAt`) or
   * the stored column name (`created_at`). The statement layer resolves the
   * former through the entity metadata and uses any other name as written.
   */
  readonly name: string
  /** Lower bound, or `null` when the range is open below. */
  readonly minValue: PgRangeValue | null
  /** Upper bound, or `null` when the range is open above. */
  readonly maxValue: PgRangeValue | null
  /** Compare the lower bound inclusively (`>=`). */
  readonly gte: boolean
  /** Compare the lower bound exclusively (`>`); implies `gte` is `false`. */
  readonly gt: boolean
  /** Compare the upper bound inclusively (`<=`). */
  readonly lte: boolean
  /** Compare the upper bound exclusively (`<`); implies `lte` is `false`. */
  readonly lt: boolean
}

/**
 * String matching filter, rendered as a "contains" match on a column:
 * `LIKE '%value%' ESCAPE '\'`.
 */
export interface PgMatchFilter {
  readonly kind: 'match'
  /**
   * Column to filter on: the property key it is declared under (`createdAt`) or
   * the stored column name (`created_at`). The statement layer resolves the
   * former through the entity metadata and uses any other name as written.
   */
  readonly name: string
  /**
   * Literal text the column must contain.
   *
   * The statement layer escapes its `LIKE` metacharacters (`%`, `_`, `\`) and
   * wraps the escaped value in `%…%`, so the value is not a pattern: `%` and `_`
   * match themselves.
   */
  readonly value: string
}

/**
 * Boolean grouping of filters.
 *
 * `must` clauses are combined with `AND`, `mustNot` with `AND NOT` and
 * `should` with `OR`; an empty group contributes nothing. The members are
 * `PgFilterCondition`s, so a group can nest another group.
 */
export interface PgBoolFilter {
  readonly kind: 'bool'
  /** Clauses that must all match (`AND`). */
  readonly must: readonly PgFilterCondition[]
  /** Clauses that must all not match (`AND NOT`). */
  readonly mustNot: readonly PgFilterCondition[]
  /** Clauses of which at least one must match (`OR`). */
  readonly should: readonly PgFilterCondition[]
}

/** Any filter shape, discriminated by `kind`. */
export type PgFilterCondition =
  | PgEqualsFilter
  | PgInFilter
  | PgRangeFilter
  | PgMatchFilter
  | PgBoolFilter

/** Bounds and operators {@link FilterBuilder.range} accepts as a seed. */
export interface PgRangeInput {
  /** Lower bound; omit for an open range. */
  readonly minValue?: PgRangeValue | null
  /** Upper bound; omit for an open range. */
  readonly maxValue?: PgRangeValue | null
  /** Lower bound inclusive (`>=`); the default for a supplied bound. */
  readonly gte?: boolean
  /** Lower bound exclusive (`>`); wins over `gte` when both are `true`. */
  readonly gt?: boolean
  /** Upper bound inclusive (`<=`); the default for a supplied bound. */
  readonly lte?: boolean
  /** Upper bound exclusive (`<`); wins over `lte` when both are `true`. */
  readonly lt?: boolean
}

/** Groups {@link FilterBuilder.bool} accepts as a seed; every group is optional. */
export interface PgBoolFilterInput {
  /** Clauses that must all match (`AND`). */
  readonly must?: readonly PgFilterCondition[]
  /** Clauses that must all not match (`AND NOT`). */
  readonly mustNot?: readonly PgFilterCondition[]
  /** Clauses of which at least one must match (`OR`). */
  readonly should?: readonly PgFilterCondition[]
}

// === Builders ==============================================================

/**
 * Builder of an equality filter.
 *
 * `name` is fixed at construction and validated with `assertValidPgName`; the
 * compared value can be replaced in place.
 */
export class EqualsFilterBuilder {
  constructor(
    private readonly name: string,
    private currentValue: unknown,
  ) {
    assertValidPgName(name, 'filter column', 'FilterBuilder')
  }

  /** Compare the column to another value. */
  value(value: unknown): this {
    this.currentValue = value
    return this
  }

  /** Produce the plain filter condition from the current state. */
  build(): PgEqualsFilter {
    return { kind: 'equals', name: this.name, value: this.currentValue }
  }
}

/**
 * Builder of a set filter; values apply in insertion order.
 *
 * Every value is a number or a string, matching the column they are compared
 * to. `name` is fixed at construction and validated with `assertValidPgName`.
 */
export class InFilterBuilder {
  private readonly currentValues: PgInValue[]

  constructor(
    private readonly name: string,
    values: readonly PgInValue[] = [],
  ) {
    assertValidPgName(name, 'filter column', 'FilterBuilder')
    this.currentValues = [...values]
  }

  /** Append one or more values to the set. */
  add(...values: PgInValue[]): this {
    this.currentValues.push(...values)
    return this
  }

  /** Produce the plain filter condition from the current state. */
  build(): PgInFilter {
    return { kind: 'in', name: this.name, values: [...this.currentValues] }
  }
}

/**
 * Mutable state of a {@link RangeFilterBuilder}.
 *
 * Every operator flag starts as `false` and the pairs stay mutually exclusive:
 * `gte` / `gt` never hold the same value for a bound, and neither do `lte` /
 * `lt` — each operator call sets its own flag and clears its counterpart.
 */
interface RangeState {
  minValue: PgRangeValue | null
  gte: boolean
  gt: boolean
  maxValue: PgRangeValue | null
  lte: boolean
  lt: boolean
}

/**
 * Builder of a range filter, one operator call per bound.
 *
 * `name` is fixed at construction and validated with `assertValidPgName`. The
 * state object is mutable so a bound (or its operator) can be re-set in place;
 * the builder itself stays the same instance throughout the chain.
 */
export class RangeFilterBuilder {
  private readonly state: RangeState

  constructor(
    private readonly name: string,
    input: PgRangeInput = {},
  ) {
    assertValidPgName(name, 'filter column', 'FilterBuilder')

    const minValue = input.minValue ?? null
    const maxValue = input.maxValue ?? null
    const gt = minValue !== null && (input.gt ?? false)
    const lt = maxValue !== null && (input.lt ?? false)

    this.state = {
      minValue,
      gte: minValue !== null && !gt && (input.gte ?? true),
      gt,
      maxValue,
      lte: maxValue !== null && !lt && (input.lte ?? true),
      lt,
    }
  }

  /** Lower bound, inclusive: `column >= value`; clears `gt`. */
  gte(value: PgRangeValue): this {
    this.state.minValue = value
    this.state.gte = true
    this.state.gt = false
    return this
  }

  /** Lower bound, exclusive: `column > value`; clears `gte`. */
  gt(value: PgRangeValue): this {
    this.state.minValue = value
    this.state.gte = false
    this.state.gt = true
    return this
  }

  /** Upper bound, inclusive: `column <= value`; clears `lt`. */
  lte(value: PgRangeValue): this {
    this.state.maxValue = value
    this.state.lte = true
    this.state.lt = false
    return this
  }

  /** Upper bound, exclusive: `column < value`; clears `lte`. */
  lt(value: PgRangeValue): this {
    this.state.maxValue = value
    this.state.lte = false
    this.state.lt = true
    return this
  }

  /** Produce the plain filter condition from the current state. */
  build(): PgRangeFilter {
    const { minValue, gte, gt, maxValue, lte, lt } = this.state

    return { kind: 'range', name: this.name, minValue, maxValue, gte, gt, lte, lt }
  }
}

/**
 * Builder of a string matching filter.
 *
 * `name` is fixed at construction and validated with `assertValidPgName`; the
 * literal value can be replaced in place.
 */
export class MatchFilterBuilder {
  constructor(
    private readonly name: string,
    private currentValue: string,
  ) {
    assertValidPgName(name, 'filter column', 'FilterBuilder')
  }

  /** Match the column against another literal value. */
  value(value: string): this {
    this.currentValue = value
    return this
  }

  /** Produce the plain filter condition from the current state. */
  build(): PgMatchFilter {
    return { kind: 'match', name: this.name, value: this.currentValue }
  }
}

/** Builder of a boolean grouping; each group appends in call order. */
export class BoolFilterBuilder {
  private readonly mustFilters: PgFilterCondition[]
  private readonly mustNotFilters: PgFilterCondition[]
  private readonly shouldFilters: PgFilterCondition[]

  constructor(input: PgBoolFilterInput = {}) {
    this.mustFilters = [...(input.must ?? [])]
    this.mustNotFilters = [...(input.mustNot ?? [])]
    this.shouldFilters = [...(input.should ?? [])]
  }

  /** Append clauses that must all match (`AND`). */
  must(...filters: PgFilterCondition[]): this {
    this.mustFilters.push(...filters)
    return this
  }

  /** Append clauses that must all not match (`AND NOT`). */
  mustNot(...filters: PgFilterCondition[]): this {
    this.mustNotFilters.push(...filters)
    return this
  }

  /** Append clauses of which at least one must match (`OR`). */
  should(...filters: PgFilterCondition[]): this {
    this.shouldFilters.push(...filters)
    return this
  }

  /** Produce the plain filter condition from the current state. */
  build(): PgBoolFilter {
    return {
      kind: 'bool',
      must: [...this.mustFilters],
      mustNot: [...this.mustNotFilters],
      should: [...this.shouldFilters],
    }
  }
}

/**
 * Entry point for creating filter conditions. Not instantiated: the static
 * methods start a builder for the shape being created.
 *
 * The column name is validated with `assertValidPgName` by every builder that
 * takes one, so an illegal name is rejected before a condition exists.
 */
export class FilterBuilder {
  /** Start an equality filter: `column = value`. */
  static equals(name: string, value: unknown): EqualsFilterBuilder {
    return new EqualsFilterBuilder(name, value)
  }

  /**
   * Start a set filter, rendered as `column = ANY($n)`.
   *
   * `values` is kept as given, duplicates included — the clause is a membership
   * test, so `anyOf('status', ['open', 'open'])` matches the same rows as a
   * single `'open'`. Every value is a number or a string, and one list should
   * hold only one of the two: it is compared to a single column.
   */
  static anyOf(name: string, values: readonly PgInValue[] = []): InFilterBuilder {
    return new InFilterBuilder(name, values)
  }

  /**
   * Start a range filter on a single column.
   *
   * A supplied bound defaults to inclusive, so `range('created_at', { minValue:
   * since })` renders `created_at >= $n`; `gt` / `lt` make a side exclusive and
   * win over `gte` / `lte` when both are seeded. Flags are normalised against the
   * bounds: a side that is `null` always reports both of its flags as `false`,
   * and the `gte` / `gt` (`lte` / `lt`) pair is never `true` on both sides.
   */
  static range(name: string, input: PgRangeInput = {}): RangeFilterBuilder {
    return new RangeFilterBuilder(name, input)
  }

  /**
   * Start a "contains" filter on a single column.
   *
   * `value` is literal text, not a pattern: the statement layer escapes its
   * `LIKE` metacharacters (`%`, `_`, `\`), wraps it in `%…%` and renders
   * `column LIKE $n ESCAPE '\'`, so the column must contain that text.
   */
  static match(name: string, value: string): MatchFilterBuilder {
    return new MatchFilterBuilder(name, value)
  }

  /**
   * Start a boolean grouping of filters, optionally seeded with groups.
   *
   * Omitted groups become empty arrays, so a seed that only sets `mustNot`
   * carries just the `AND NOT` part.
   */
  static bool(input: PgBoolFilterInput = {}): BoolFilterBuilder {
    return new BoolFilterBuilder(input)
  }
}
