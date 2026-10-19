// ---------------------------------------------------------------------------
// PgStore — the PostgreSQL implementation of `StoreProxy` (runtime)
//
// One `PgStore` drives the row primitives of a single entity against a single
// database. It is handed the entity metadata — the table, the key column and
// the `@PgColumn` column mapping — together with the `PgDataSource` the entity's
// `dbName` resolves to, so it never creates or owns a connection pool.
//
// The datasource separates the two access paths — `PgDataSource.query` on the
// master, `PgDataSource.queryRead` on a replica — and the store currently uses
// the master for every primitive. The primary-key lookup, the paged read and the
// count are included on purpose: they must observe the rows a write just
// committed, which a replica may still be lagging behind.
//
// The four statements the store needs — insert, full-record update, delete and
// the primary-key lookup — are built once from the entity metadata by the
// constructor (see `PgSqlTemplate`), so a call only binds its parameters and
// issues a statement it already holds. The paged read and the count are the
// exceptions: their `WHERE` / `ORDER BY` / `LIMIT` clauses depend on the options
// of the call, so they are built per call from the same metadata.
//
// The store speaks rows, not entities: a row is keyed by PostgreSQL column name
// (`PgKeyMetadata.column` / `PgColumnMetadata.column`), never by the camelCase
// property name. Reads and writes therefore use the same shape, and mapping a
// row to an entity is the caller's concern.
// ---------------------------------------------------------------------------

import { PgSqlTemplate } from './sql'
import type { PgFilterCondition } from './filter'
import type { PgSelectPageOptions } from './sql'
import type { StoreProxy } from './store'
import type { PgDataSource } from './datasource'
import type { PgEntityMetadata } from '../shared/types.ts'

/**
 * PostgreSQL-backed {@link StoreProxy} for a single entity.
 *
 * The row primitives are expressed as SQL against the entity's table, with the
 * column names taken from the entity metadata (a camelCase property maps to its
 * snake_case column). `T` is the entity type; the key property is fixed to `id`
 * and its value is always a `string`.
 */
export class PgStore<T> implements StoreProxy<T> {
  /**
   * Entity metadata the store was built for: the database, schema, table, key
   * and columns the statements are derived from.
   */
  private readonly metadata: PgEntityMetadata

  /**
   * Datasource of the entity's database. The store never creates or owns a
   * pool: every statement is issued through this datasource, writes through
   * `query` (master) and reads through `queryRead` (a replica, or the master).
   */
  private readonly dataSource: PgDataSource

  /** `INSERT` statement, built once from the entity metadata. */
  private readonly insertSql: string

  /** Full-record `UPDATE` statement, built once from the entity metadata. */
  private readonly updateSql: string

  /** `DELETE` statement, built once from the entity metadata. */
  private readonly deleteSql: string

  /** Primary-key lookup statement, built once from the entity metadata. */
  private readonly selectSql: string

  /**
   * The metadata and the datasource are kept for the life of the store, and the
   * four statements are built from the metadata once here — the metadata never
   * changes for a given instance, so they are reused by every call.
   *
   * @param metadata   Resolved entity metadata — database, schema, table, key
   *                   and columns — as produced by the build-time parser.
   * @param dataSource Datasource of the entity's database; every statement is
   *                   issued through it, so the store holds no pool of its own.
   * @throws When {@link PgSqlTemplate.updateRow} cannot build the `UPDATE`, i.e.
   *         the entity declares no columns to write.
   */
  constructor(metadata: PgEntityMetadata, dataSource: PgDataSource) {
    this.metadata = metadata
    this.dataSource = dataSource

    this.insertSql = PgSqlTemplate.insertRow(metadata)
    this.updateSql = PgSqlTemplate.updateRow(metadata)
    this.deleteSql = PgSqlTemplate.deleteRow(metadata)
    this.selectSql = PgSqlTemplate.selectRow(metadata)
  }

  /**
   * Return the entity metadata the store was built for.
   *
   * The metadata is the one handed to the constructor and held by the store —
   * the same object its four statements were derived from — so the caller reads
   * the exact database, schema, table, key and column mapping the store works
   * against rather than a copy of it.
   *
   * @returns The resolved entity metadata of this store.
   */
  getMetadata(): PgEntityMetadata {
    return this.metadata
  }

  /**
   * Insert a new row and return it.
   *
   * The bound values come from {@link PgSqlTemplate.insertRowValues}, which
   * reads them from `row` in the order the statement binds them — the key value
   * first, then the declared columns in declaration order — by PostgreSQL column
   * name, binding `null` for a column `row` does not carry. Statement and
   * parameters are therefore derived from the same metadata definition, so they
   * cannot drift apart.
   *
   * The statement carries no `RETURNING` clause, so nothing is read back from
   * the database: the record that was written is the one `row` described, and it
   * is returned as the stored entity.
   *
   * @param row The complete record to insert, including the key.
   * @returns The inserted entity.
   */
  async insert(row: T): Promise<T> {
    const values = PgSqlTemplate.insertRowValues(this.metadata, row)

    await this.dataSource.query(this.insertSql, values)
    return row
  }

  /**
   * Replace the row whose key equals the key carried by `row`, and return it.
   *
   * The bound values come from {@link PgSqlTemplate.updateRowValues}, which
   * reads them from `row` in the order the statement binds them: the declared
   * columns in declaration order first, then the key value last — the reverse of
   * {@link PgStore.insert}, where the key comes first. Values are read by
   * PostgreSQL column name, binding `null` for a column `row` does not carry.
   * Statement and parameters are therefore derived from the same metadata
   * definition, so they cannot drift apart.
   *
   * The statement carries no `RETURNING` clause, so nothing is read back from
   * the database: the record that was written is the one `row` described, and it
   * is returned as the stored entity.
   *
   * @param row The complete record to replace, including the key.
   * @returns The replaced entity.
   */
  async update(row: T): Promise<T> {
    const values = PgSqlTemplate.updateRowValues(this.metadata, row)

    await this.dataSource.query(this.updateSql, values)
    return row
  }

  /**
   * Delete the row whose key equals `id`.
   *
   * `id` is bound as the single parameter {@link PgSqlTemplate.deleteRow}
   * declares, so at most one row can match.
   *
   * The statement carries no `RETURNING` clause, and a delete does not need one:
   * the number of affected rows already reports whether a row matched, which is
   * exactly what this method answers with.
   *
   * @param id The key of the row to delete.
   * @returns whether a row was deleted — `false` when no row matched the key.
   */
  async delete(id: string): Promise<boolean> {
    const { rowCount } = (await this.dataSource.query(this.deleteSql, [id])) as {
      rowCount: number | null
    }

    return (rowCount ?? 0) > 0
  }

  /**
   * Return the row whose key equals `id`, or `null` when it does not exist.
   *
   * The lookup goes through `PgDataSource.query` — the same master path as the
   * writes — rather than the read path: a primary-key read must observe the row
   * a write just committed, which a replica may still be lagging behind.
   *
   * `id` is bound as the single parameter {@link PgSqlTemplate.selectRow}
   * declares. That statement reads back exactly the key column plus the declared
   * columns, so the row arrives keyed by PostgreSQL column name — the same shape
   * {@link PgStore.insert} and {@link PgStore.update} accept, which makes the
   * round trip an identity.
   *
   * @param id The key of the row to read.
   * @returns The stored row, or `null` when no row matches the key.
   */
  async findById(id: string): Promise<T | null> {
    const { rows } = (await this.dataSource.query(this.selectSql, [id])) as { rows: T[] }

    return rows[0] ?? null
  }

  /**
   * Count the rows of the entity, optionally narrowed by `filter`.
   *
   * The statement and its values come from {@link PgSqlTemplate.selectCount},
   * which renders `filter` into the `WHERE` clause with one placeholder per
   * value it references: statement and parameters are produced by the same walk
   * of the filter, so they cannot drift apart. `filter` is the only input, so
   * the statement is built per call rather than in the constructor; without a
   * filter it counts every row of the entity's table.
   *
   * The count goes through `PgDataSource.query` — the master path, as the
   * primary-key lookup does — so it observes the rows this store just wrote
   * instead of a replica that may still be lagging behind.
   *
   * `COUNT(*)` yields a single row, and PostgreSQL reports it as `bigint`, which
   * the driver hands back as a string; the value is therefore converted to a
   * number, and a result that carries no row is reported as `0`.
   *
   * @param filter Optional filter conditions driving the `WHERE` clause.
   * @returns The number of matching rows.
   */
  async count(filter?: PgFilterCondition | null): Promise<number> {
    const { sql, values } = PgSqlTemplate.selectCount(this.metadata, filter)
    const { rows } = (await this.dataSource.query(sql, values)) as {
      rows: Array<{ count: string }>
    }

    return Number(rows[0]?.count ?? 0)
  }

  /**
   * Return one page of the entity's rows.
   *
   * The statement and its values come from {@link PgSqlTemplate.selectPage},
   * which renders `options.filter` into the `WHERE` clause, `options.sort` into
   * the `ORDER BY` clause and binds `options.limit` / `options.offset` last:
   * statement and parameters are produced by the same walk, so the placeholders
   * cannot drift from the value list. Only the column list comes from the
   * metadata the store already holds, so the rows have the same shape
   * {@link PgStore.findById} returns. The options are the only input, so the
   * statement is built per call rather than in the constructor.
   *
   * The read goes through `PgDataSource.query` — the master path, as the
   * primary-key lookup and the count do — so the page and its total observe the
   * rows this store just wrote instead of a replica that may still be lagging
   * behind.
   *
   * @param options Filter, sort and paging of the page to read.
   * @returns The rows of the page, in `sort` order; empty when the offset is
   *          past the last row.
   */
  async selectPage(options: PgSelectPageOptions): Promise<T[]> {
    const { sql, values } = PgSqlTemplate.selectPage(this.metadata, options)
    const { rows } = (await this.dataSource.query(sql, values)) as { rows: T[] }

    return rows
  }
}
