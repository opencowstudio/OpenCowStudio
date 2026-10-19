// ---------------------------------------------------------------------------
// Sort conditions (runtime)
//
// A typed description of the terms an `ORDER BY` clause is built from. Two
// shapes cover what a statement needs:
//
//   * `PgColumnSort`      — one column together with its direction.
//   * `PgMultiColumnSort` — an ordered list of single-column sorts, rendered as
//                           `a ASC, b DESC`.
//
// Both shapes carry a `kind` tag, mirroring the filter conditions
// (`runtime/filter.ts`), so `SortCondition` is a discriminated union narrowed
// on `kind` even though the two shapes happen not to overlap today.
//
// Creation goes through one entry point, `SortBuilder`, so there is a single
// name to remember:
//
//   SortBuilder.column('created_at').desc().build()
//   SortBuilder.multiColumn().asc('name').desc('score').build()
//
// Each shape has its own builder — `ColumnSortBuilder` / `MultiColumnSortBuilder`
// — and the builders are mutable: `.asc()` / `.desc()` / `.order()` and
// `.asc(name)` / `.desc(name)` / `.add()` change the builder in place and return
// it, so an existing builder can be adjusted without constructing another one.
// `name` is always required and is validated with `assertValidPgName` when it
// enters a builder, so a sort can never carry a column name the statement layer
// would embed into SQL unchecked; the direction defaults to `ASC`. `build()`
// snapshots the current state into a plain data object: no `pg` import, no SQL
// and no behaviour — rendering a clause belongs to the statement layer
// (`runtime/sql.ts`).
// ---------------------------------------------------------------------------

import { assertValidPgName } from '../shared/naming.ts'

/** Sort direction of an `ORDER BY` term. */
export type PgSortOrder = 'ASC' | 'DESC'

/** Sort condition on a single column. */
export interface PgColumnSort {
  readonly kind: 'column'
  /** Column name, as stored (snake_case, unquoted). */
  readonly name: string
  /** Sort direction. */
  readonly order: PgSortOrder
}

/** Sort condition over several columns, applied in order. */
export interface PgMultiColumnSort {
  readonly kind: 'multi-column'
  /**
   * The columns to sort by, in the order they are applied — the first entry is
   * the primary key of the ordering.
   */
  readonly sorts: readonly PgColumnSort[]
}

/** Either sort condition shape, discriminated by `kind`. */
export type SortCondition = PgColumnSort | PgMultiColumnSort

/**
 * Builder of a single-column sort condition.
 *
 * The column name is validated with `assertValidPgName` as it enters the
 * builder, so every `ColumnSortBuilder` — created through `SortBuilder.column`
 * or by a `MultiColumnSortBuilder` — carries a legal PostgreSQL name. The
 * direction defaults to `ASC`.
 */
export class ColumnSortBuilder {
  private sortOrder: PgSortOrder

  constructor(
    private readonly name: string,
    order: PgSortOrder = 'ASC',
  ) {
    assertValidPgName(name, 'sort column', 'SortBuilder')
    this.sortOrder = order
  }

  /** Sort ascending; the default, so it is only needed to undo a `desc()`. */
  asc(): this {
    this.sortOrder = 'ASC'
    return this
  }

  /** Sort descending. */
  desc(): this {
    this.sortOrder = 'DESC'
    return this
  }

  /** Sort in an explicit direction. */
  order(order: PgSortOrder): this {
    this.sortOrder = order
    return this
  }

  /** Produce the plain sort condition from the current state. */
  build(): PgColumnSort {
    return { kind: 'column', name: this.name, order: this.sortOrder }
  }
}

/** Builder of a multi-column sort condition; columns apply in insertion order. */
export class MultiColumnSortBuilder {
  private readonly sorts: PgColumnSort[] = []

  constructor(seed: readonly PgColumnSort[] = []) {
    this.sorts.push(...seed)
  }

  /** Append an ascending column. */
  asc(name: string): this {
    return this.append(name, 'ASC')
  }

  /** Append a descending column. */
  desc(name: string): this {
    return this.append(name, 'DESC')
  }

  /** Append a column with an explicit direction. */
  column(name: string, order: PgSortOrder = 'ASC'): this {
    return this.append(name, order)
  }

  /** Append an already-built single-column sort. */
  add(sort: PgColumnSort): this {
    this.sorts.push(sort)
    return this
  }

  /** Produce the plain sort condition from the current state. */
  build(): PgMultiColumnSort {
    return { kind: 'multi-column', sorts: [...this.sorts] }
  }

  private append(name: string, order: PgSortOrder): this {
    return this.add(new ColumnSortBuilder(name, order).build())
  }
}

/**
 * Entry point for creating sort conditions. Not instantiated: the static
 * methods start a builder for the shape being created.
 */
export class SortBuilder {
  /**
   * Start a single-column sort; the direction defaults to `ASC`.
   *
   * `name` is validated with `assertValidPgName`, so an illegal column name is
   * rejected here instead of reaching the statement layer.
   */
  static column(name: string, order: PgSortOrder = 'ASC'): ColumnSortBuilder {
    return new ColumnSortBuilder(name, order)
  }

  /**
   * Start a multi-column sort, optionally seeded with already-built sorts.
   *
   * Columns then append with `asc()` / `desc()` / `column()` / `add()`, in the
   * order they are applied:
   * `SortBuilder.multiColumn().desc('score').asc('name').build()`.
   */
  static multiColumn(...sorts: PgColumnSort[]): MultiColumnSortBuilder {
    return new MultiColumnSortBuilder(sorts)
  }
}
