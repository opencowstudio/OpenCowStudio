// ---------------------------------------------------------------------------
// PgTableRepository — PgEntityRepository over a plain table (runtime)
//
// The entity-level CRUD surface of a single entity whose storage is one plain
// table. It owns no SQL of its own: every primitive is delegated to the
// `StoreProxy` it is built with, which speaks rows (PostgreSQL column names)
// while this class speaks entities (camelCase property names). The translation
// between the two shapes is the only thing it adds:
//
//   * entity -> row, through `snakeizeKeys` (`shared/naming.ts`);
//   * row -> entity, through `camelizeKeys`.
//
// Both helpers deliberately keep only the keys whose spelling actually changes,
// so a key that is already correct (`id`, `name`) would be lost by a bare call.
// `carryOverUnchangedKeys` (see below) re-adds exactly those keys, which is what
// makes the round trip lossless.
//
// `update` is a full-record operation, so the key is taken from the entity
// itself: `data` carries its `id`. Each write completes its row through a hook,
// and both hooks mutate the row in place:
//
//   * `preInsert` — applies the column defaults the metadata declares
//     (`applyColumnDefaults`), generates a key when the caller left it out, and
//     stamps the creation timestamp;
//   * `preUpdate` — stamps the update timestamp.
//
// The conventions are fixed, like the key one: the columns are `id`,
// `created_at` and `updated_at`, resolved as column names because the row handed
// to the store is already snake_case.
//
// The repository therefore needs no metadata of its own: the column mapping
// (property name <-> column name) is the store's concern, a property that maps
// to a column of another name is handled by the two conversions above, and the
// declared defaults are read from the store through `getMetadata`.
// ---------------------------------------------------------------------------

import { generateId } from '@opencowstudio/core'
import { camelToSnake, snakeToCamel, camelizeKeys, snakeizeKeys } from '../shared/naming.ts'
import type { FilterCondition } from './filter'
import type { SortCondition } from './sort'
import type { StoreProxy } from './store'
import type { PgEntityRepository } from './repository'

/**
 * Page size the repository reads when the requested `size` is out of range.
 *
 * A read is always bounded: a caller that passes a nonsensical size (a
 * non-number, a fraction, `0`, a negative value or one at or above
 * {@link MAX_PAGE_SIZE}) gets this page instead of an unbounded scan.
 */
const DEFAULT_PAGE_SIZE = 100

/** Exclusive upper bound of an accepted page size. */
const MAX_PAGE_SIZE = 1000

/** Exclusive upper bound of an accepted position of the first row. */
const MAX_PAGE_FROM = 100_000

/**
 * Normalise a requested page size into one the store accepts.
 *
 * The size is how many rows the statement binds to `LIMIT`, so it must be a
 * whole number in the open range `(0, MAX_PAGE_SIZE)`: a fraction would be
 * rejected by PostgreSQL, and `0`, a negative value or an unbounded request
 * would make the read meaningless. Anything outside that range is replaced by
 * {@link DEFAULT_PAGE_SIZE} rather than reported as an error, so a caller can
 * pass user input straight through.
 *
 * @param size The requested page size.
 * @returns The size to read with — `size` itself when it is valid.
 */
function resolvePageSize(size: number): number {
  return Number.isInteger(size) && size > 0 && size < MAX_PAGE_SIZE ? size : DEFAULT_PAGE_SIZE
}

/**
 * Normalise the requested position of the first row into one the store accepts.
 *
 * The position is the value bound to `OFFSET`, so it must be a whole number in
 * the range `[0, MAX_PAGE_FROM)`: a fraction would be rejected by PostgreSQL,
 * and a negative value or a position beyond the accepted maximum (deep-offset
 * scans are expensive) would make the read meaningless. Anything outside that
 * range is replaced by `0` — the first row — rather than reported as an error.
 *
 * @param from The requested position.
 * @returns The position to read from — `from` itself when it is valid.
 */
function resolvePageFrom(from: number): number {
  return Number.isInteger(from) && from >= 0 && from < MAX_PAGE_FROM ? from : 0
}

/**
 * Apply a key-rewriting conversion to `source` and carry every untouched key
 * over.
 *
 * `snakeizeKeys` / `camelizeKeys` rebuild the object from the keys they rewrite
 * only, so a key whose spelling does not change is dropped from the result.
 * That is what the two callers need to avoid (`id`, `name` and every other
 * single-word name must survive), so the kept keys are re-added here: a key is
 * carried over when the conversion leaves its name untouched, and the rewritten
 * spelling wins when it does not.
 *
 * @param source The object to convert.
 * @param convert The name conversion that drives the rewrite, applied to one
 * key at a time (`camelToSnake` / `snakeToCamel`).
 * @param rewrite The bulk rewrite producing the converted keys, applied to the
 * whole object (`snakeizeKeys` / `camelizeKeys`).
 */
function carryOverUnchangedKeys(
  source: Record<string, unknown>,
  convert: (key: string) => string,
  rewrite: (source: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> {
  const target = rewrite(source)

  for (const [key, value] of Object.entries(source)) {
    if (!(convert(key) in target)) {
      target[key] = value
    }
  }

  return target
}

/**
 * Entity-level repository for an entity stored in one plain (non-partitioned)
 * table.
 *
 * `T` is the entity type; the key property is fixed to `id` and its value is
 * always a `string` (see {@link PgEntityRepository}). Every primitive is
 * delegated to the {@link StoreProxy} handed to the constructor, so this class
 * never creates a connection, builds a statement or holds metadata of its own —
 * the metadata it completes a row from is read back through
 * {@link StoreProxy.getMetadata}.
 */
export class PgTableRepository<T> implements PgEntityRepository<T> {
  /** The row primitives every operation is delegated to. */
  private readonly store: StoreProxy<T>

  /**
   * @param store Row-level store of the entity's table, already bound to the
   *              entity metadata and the datasource of its database.
   */
  constructor(store: StoreProxy<T>) {
    this.store = store
  }

  /**
   * Insert `data` and return the stored entity.
   *
   * `data` is converted to a row first (see {@link PgTableRepository.toRow}),
   * the row is completed by {@link PgTableRepository.preInsert} — the declared
   * column defaults are filled in, a missing key is generated and the creation
   * timestamp is stamped — and the completed row is what the store writes. The
   * row the store returns (the very one it was handed) is converted back to an
   * entity (see {@link PgTableRepository.toEntity}), so the caller keeps working
   * with entities on both sides and gets back the completed record.
   *
   * @param data The record to insert; its `id` may be omitted, in which case one
   *             is generated.
   * @returns The inserted entity, carrying the defaults, key and timestamp
   *          actually written.
   */
  async insert(data: T): Promise<T> {
    const row = this.toRow(data)
    this.preInsert(row)

    const stored = await this.store.insert(row as unknown as T)

    return this.toEntity(stored as unknown as Record<string, unknown>)
  }

  /**
   * Replace the row addressed by the `id` carried by `data`, and return the
   * stored entity.
   *
   * `data` is converted to a row first (see {@link PgTableRepository.toRow}),
   * the row is completed by {@link PgTableRepository.preUpdate} — the update
   * timestamp is refreshed — and the completed row is what the store writes. The
   * row the store returns (the very one it was handed) is converted back to an
   * entity (see {@link PgTableRepository.toEntity}), so the caller keeps working
   * with entities on both sides.
   *
   * @param data The complete new state of the record, including its `id`.
   * @returns The replaced entity, carrying the update timestamp actually
   *          written.
   */
  async update(data: T): Promise<T> {
    const row = this.toRow(data)
    this.preUpdate(row)

    const stored = await this.store.update(row as unknown as T)

    return this.toEntity(stored as unknown as Record<string, unknown>)
  }

  /**
   * Delete the row whose key equals `id`.
   *
   * The store reports whether a row matched, but the contract answers with
   * nothing, so the outcome is dropped.
   *
   * @param id The key of the row to delete.
   */
  async delete(id: string): Promise<void> {
    await this.store.delete(id)
  }

  /**
   * Return the entity whose key equals `id`, or `null` when it does not exist.
   *
   * The row read back from the store is converted to an entity (see
   * {@link PgTableRepository.toEntity}), and a miss stays a `null` rather than
   * an empty object.
   *
   * @param id The key of the row to read.
   * @returns The stored entity, or `null` when no row matches the key.
   */
  async findById(id: string): Promise<T | null> {
    const row = await this.store.findById(id)

    return row === null ? null : this.toEntity(row as unknown as Record<string, unknown>)
  }

  /**
   * Return a set of entities, optionally narrowed and ordered.
   *
   * `size` and `from` are normalised before the store is called, so a caller
   * cannot ask for a page the storage layer rejects: `size` must be a whole
   * number in the open range (0, {@link MAX_PAGE_SIZE}) and falls back to
   * {@link DEFAULT_PAGE_SIZE} otherwise; `from` must be a whole number in the
   * range [0, {@link MAX_PAGE_FROM}) and falls back to `0` otherwise. The filter
   * and the sort are passed to the store as written — a filter names its column
   * by property key or by column name, and the store resolves both against the
   * entity metadata it holds (see `StoreProxy.findMany`).
   *
   * Every row the store returns is converted to an entity (see
   * {@link PgTableRepository.toEntity}), so the caller gets entities on both
   * sides — the same shape {@link PgTableRepository.findById} returns.
   *
   * @param size   How many entities to read; falls back to a page of 100 when it
   *               is out of range.
   * @param from   Position of the first entity; falls back to the first one when
   *               it is out of range.
   * @param filter Optional filter conditions driving the `WHERE` clause.
   * @param sort   Optional sort condition driving the `ORDER BY` clause.
   * @returns The matching entities, in `sort` order; empty when `from` is past
   *          the last row.
   */
  async findMany(
    size: number,
    from: number,
    filter?: FilterCondition | null,
    sort?: SortCondition | null,
  ): Promise<T[]> {
    const rows = await this.store.findMany(resolvePageSize(size), resolvePageFrom(from), filter, sort)

    return rows.map(row => this.toEntity(row as unknown as Record<string, unknown>))
  }

  /**
   * Count the entities matching `filter`, or all of them when it is omitted.
   *
   * The filter is passed to the store as written. Nothing is converted: a filter
   * names its column by property key or by column name, and the store resolves
   * both against the entity metadata it holds (see `StoreProxy.count`), so it
   * accepts a filter written in the entity shape this repository speaks.
   *
   * A count is an aggregate, so there is no row to convert back to an entity:
   * the number the store reports is returned unchanged.
   *
   * @param filter Optional filter conditions narrowing the count.
   * @returns The number of matching entities.
   */
  async count(filter?: FilterCondition | null): Promise<number> {
    return this.store.count(filter)
  }

  /**
   * Complete a row before it is written, in place.
   *
   * Called by {@link PgTableRepository.insert} on the converted row, so the
   * columns are addressed by their snake_case names. The declared defaults are
   * applied first (see {@link PgTableRepository.applyColumnDefaults}), and only
   * then are the two fixed conventions of an insert resolved:
   *
   *  * `id` — when the row carries no key, one is generated with `generateId`
   *    (`@opencowstudio/core`), which keeps key assignment out of the caller's
   *    hands;
   *  * `created_at` — when the row does not already carry a `Date`, it is
   *    stamped with the current time, so the creation column cannot be written
   *    as `NULL` and cannot be set to a non-date value. A declared default that
   *    filled the column in one step earlier is therefore replaced: a `DATE`
   *    column declares no default (see `ColumnDefault`), and a creation stamp
   *    is always "now" rather than a fixed literal.
   *
   * The row is mutated rather than copied, so the caller receives the very
   * values that were written (see {@link PgTableRepository.insert}'s return
   * value).
   *
   * A subclass may override this hook to complete a row further, or to take part
   * in the partitioning of the storage.
   *
   * @param row The snake_case row about to be inserted.
   */
  protected preInsert(row: Record<string, unknown>): void {
    this.applyColumnDefaults(row)

    if (!row.id) {
      row.id = generateId()
    }

    if (!(row.created_at instanceof Date)) {
      row.created_at = new Date()
    }
  }

  /**
   * Complete a row before it is written by an update, in place.
   *
   * Called by {@link PgTableRepository.update} on the converted row, so the
   * column is addressed by its snake_case name. It resolves the one fixed
   * convention of an update:
   *
   *  * `updated_at` — when the row carries no `Date`, it is stamped with the
   *    current time. A missing value and a value of another type are treated the
   *    same way (`undefined`, `null`, a string, …), so the update column can
   *    never be written as `NULL` and never carries a non-date value.
   *
   * Unlike {@link PgTableRepository.preInsert}, this hook applies no column
   * defaults: an update writes every declared column, so the values are the
   * caller's by definition.
   *
   * The row is mutated rather than copied, so the caller receives the very
   * values that were written (see {@link PgTableRepository.update}'s return
   * value).
   *
   * A subclass may override this hook to complete a row further, or to take part
   * in the partitioning of the storage.
   *
   * @param row The snake_case row about to be written by an update.
   */
  protected preUpdate(row: Record<string, unknown>): void {
    if (!(row.updated_at instanceof Date)) {
      row.updated_at = new Date()
    }
  }

  /**
   * Fill in the declared column defaults of a row, in place.
   *
   * Called first by {@link PgTableRepository.preInsert}, so every row written by
   * {@link PgTableRepository.insert} carries the defaults its metadata declares
   * before the key and the creation timestamp are resolved.
   *
   * The columns come from the entity metadata the store was built for (see
   * {@link StoreProxy.getMetadata}), so the repository still needs no metadata
   * of its own: every declared {@link ColumnMetadata} whose column the row
   * leaves empty receives that column's normalised `default` — the value the
   * builder derived from `@PgColumn({ default })`, which is the type's zero
   * value when the option is omitted.
   *
   * A column counts as empty when its value is falsy — the same test
   * {@link PgTableRepository.preInsert} applies to `id` and `created_at` — so a
   * row may be built from a sparse record and still carry a complete, typed
   * shape. The key column takes no part: defaults are declared on
   * {@link ColumnMetadata} only, the key is completed by
   * {@link PgTableRepository.preInsert}.
   *
   * The row is mutated rather than copied, so the caller observes the defaults
   * that were applied.
   *
   * A subclass may override this hook to default a row differently.
   *
   * @param row The snake_case row to complete.
   */
  protected applyColumnDefaults(row: Record<string, unknown>): void {
    const { columns } = this.store.getMetadata()

    for (const column of columns) {
      if (!row[column.column]) {
        row[column.column] = column.default
      }
    }
  }

  /**
   * Convert an entity into the row the store speaks.
   *
   * Every key is rewritten to its snake_case column name (see
   * `carryOverUnchangedKeys`), so a camelCase property such as `createdAt` is
   * bound to the column `created_at` while a single-word property keeps its
   * name. Values are carried over untouched — nesting is not rewritten, so a
   * JSON column keeps its object.
   */
  private toRow(data: T): Record<string, unknown> {
    const fields = data as unknown as Record<string, unknown>

    return carryOverUnchangedKeys(fields, camelToSnake, snakeizeKeys)
  }

  /**
   * Convert a row read from the store into an entity.
   *
   * Reverse of {@link PgTableRepository.toRow}: every key is rewritten to its
   * camelCase property name (see `carryOverUnchangedKeys`), so `created_at`
   * becomes `createdAt` while a single-word column such as `id` keeps its name.
   */
  private toEntity(row: Record<string, unknown>): T {
    return carryOverUnchangedKeys(row, snakeToCamel, camelizeKeys) as T
  }
}
