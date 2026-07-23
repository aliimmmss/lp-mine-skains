import type { DataQuality } from '@lp-mine/core'
import { DatabaseSync } from 'node:sqlite'
import { getAddress, type Address } from 'viem'
import type { PoolSnapshot } from './index.js'

export type PoolObservationOrder = 'ascending' | 'descending'

export type PoolObservationQuery = {
  fromBlock?: bigint
  toBlock?: bigint
  from?: Date
  to?: Date
  order?: PoolObservationOrder
  limit?: number
}

type ObservationRow = {
  chain_id: number
  pool_address: Address
  block_number: string
  observed_at: string
  token0_address: Address
  token0_symbol: string
  token0_decimals: number
  token1_address: Address
  token1_symbol: string
  token1_decimals: number
  fee_tier: number
  sqrt_price_x96: string
  tick: number
  tick_spacing: number
  active_liquidity: string
  fee_growth_global0_x128: string | null
  fee_growth_global1_x128: string | null
  quality: string
  warnings_json: string
}

const OBSERVATION_COLUMNS = `
  chain_id, pool_address, block_number, observed_at,
  token0_address, token0_symbol, token0_decimals,
  token1_address, token1_symbol, token1_decimals,
  fee_tier, sqrt_price_x96, tick, tick_spacing,
  active_liquidity, fee_growth_global0_x128, fee_growth_global1_x128,
  quality, warnings_json
`

export class SqlitePoolObservationStore {
  readonly #database: DatabaseSync

  constructor(path: string) {
    this.#database = new DatabaseSync(path)
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS pool_observations (
        chain_id INTEGER NOT NULL,
        pool_address TEXT NOT NULL,
        block_number TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        token0_address TEXT NOT NULL,
        token0_symbol TEXT NOT NULL,
        token0_decimals INTEGER NOT NULL,
        token1_address TEXT NOT NULL,
        token1_symbol TEXT NOT NULL,
        token1_decimals INTEGER NOT NULL,
        fee_tier INTEGER NOT NULL,
        sqrt_price_x96 TEXT NOT NULL,
        tick INTEGER NOT NULL,
        tick_spacing INTEGER NOT NULL,
        active_liquidity TEXT NOT NULL,
        fee_growth_global0_x128 TEXT,
        fee_growth_global1_x128 TEXT,
        quality TEXT NOT NULL CHECK (quality IN ('complete', 'partial', 'stale')),
        warnings_json TEXT NOT NULL,
        PRIMARY KEY (pool_address, block_number)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS pool_observations_block
      ON pool_observations(CAST(block_number AS INTEGER));

      CREATE INDEX IF NOT EXISTS pool_observations_pool_time
      ON pool_observations(pool_address, observed_at);
    `)
    this.#migrateFeeGrowthColumns()
  }

  /** Adds fee growth columns to databases created before they existed. Idempotent. */
  #migrateFeeGrowthColumns(): void {
    const columns = this.#database.prepare('SELECT name FROM pragma_table_info(?)').all('pool_observations') as {
      name: string
    }[]
    const names = new Set(columns.map((column) => column.name))
    if (!names.has('fee_growth_global0_x128')) {
      this.#database.exec('ALTER TABLE pool_observations ADD COLUMN fee_growth_global0_x128 TEXT')
    }
    if (!names.has('fee_growth_global1_x128')) {
      this.#database.exec('ALTER TABLE pool_observations ADD COLUMN fee_growth_global1_x128 TEXT')
    }
  }

  saveSnapshots(snapshots: readonly PoolSnapshot[]): number {
    if (snapshots.length === 0) return 0

    const insert = this.#database.prepare(`
      INSERT INTO pool_observations (
        chain_id, pool_address, block_number, observed_at,
        token0_address, token0_symbol, token0_decimals,
        token1_address, token1_symbol, token1_decimals,
        fee_tier, sqrt_price_x96, tick, tick_spacing,
        active_liquidity, fee_growth_global0_x128, fee_growth_global1_x128,
        quality, warnings_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(pool_address, block_number) DO UPDATE SET
        chain_id = excluded.chain_id,
        observed_at = excluded.observed_at,
        token0_address = excluded.token0_address,
        token0_symbol = excluded.token0_symbol,
        token0_decimals = excluded.token0_decimals,
        token1_address = excluded.token1_address,
        token1_symbol = excluded.token1_symbol,
        token1_decimals = excluded.token1_decimals,
        fee_tier = excluded.fee_tier,
        sqrt_price_x96 = excluded.sqrt_price_x96,
        tick = excluded.tick,
        tick_spacing = excluded.tick_spacing,
        active_liquidity = excluded.active_liquidity,
        fee_growth_global0_x128 = excluded.fee_growth_global0_x128,
        fee_growth_global1_x128 = excluded.fee_growth_global1_x128,
        quality = excluded.quality,
        warnings_json = excluded.warnings_json
    `)

    this.#database.exec('BEGIN IMMEDIATE')
    try {
      for (const snapshot of snapshots) {
        insert.run(
          snapshot.block.chainId,
          snapshot.value.poolAddress,
          snapshot.block.blockNumber.toString(),
          snapshot.block.observedAt.toISOString(),
          snapshot.value.token0.address,
          snapshot.value.token0.symbol,
          snapshot.value.token0.decimals,
          snapshot.value.token1.address,
          snapshot.value.token1.symbol,
          snapshot.value.token1.decimals,
          snapshot.value.feeTier,
          snapshot.value.sqrtPriceX96.toString(),
          snapshot.value.tick,
          snapshot.value.tickSpacing,
          snapshot.value.activeLiquidity.toString(),
          snapshot.value.feeGrowthGlobal0X128?.toString() ?? null,
          snapshot.value.feeGrowthGlobal1X128?.toString() ?? null,
          snapshot.quality,
          JSON.stringify(snapshot.warnings),
        )
      }
      this.#database.exec('COMMIT')
      return snapshots.length
    } catch (error) {
      this.#database.exec('ROLLBACK')
      throw error
    }
  }

  listObservations(poolAddress: Address, query: PoolObservationQuery = {}): readonly PoolSnapshot[] {
    const limit = validateQuery(query)
    const direction = query.order === 'descending' ? 'DESC' : 'ASC'
    const rows = this.#database
      .prepare(
        `
        SELECT ${OBSERVATION_COLUMNS}
        FROM pool_observations
        WHERE pool_address = ?
          AND CAST(block_number AS INTEGER) >= CAST(? AS INTEGER)
          AND CAST(block_number AS INTEGER) <= CAST(? AS INTEGER)
          AND observed_at >= ?
          AND observed_at <= ?
        ORDER BY observed_at ${direction}, CAST(block_number AS INTEGER) ${direction}
        LIMIT ?
      `,
      )
      .all(
        getAddress(poolAddress),
        query.fromBlock?.toString() ?? '0',
        query.toBlock?.toString() ?? '9223372036854775807',
        query.from?.toISOString() ?? '0000-01-01T00:00:00.000Z',
        query.to?.toISOString() ?? '9999-12-31T23:59:59.999Z',
        limit,
      ) as ObservationRow[]

    return rows.map(rowToSnapshot)
  }

  firstObservationAtOrAfter(poolAddress: Address, observedAt: Date, to?: Date): PoolSnapshot | null {
    validateTimestamp(observedAt, 'Observation lower-bound timestamp')
    if (to) validateTimestamp(to, 'Observation upper-bound timestamp')
    if (to && observedAt > to) throw new RangeError('Observation lower-bound timestamp must not exceed upper bound')
    return (
      this.listObservations(poolAddress, {
        from: observedAt,
        ...(to ? { to } : {}),
        order: 'ascending',
        limit: 1,
      })[0] ?? null
    )
  }

  lastObservationAtOrBefore(poolAddress: Address, observedAt: Date): PoolSnapshot | null {
    validateTimestamp(observedAt, 'Observation upper-bound timestamp')
    return this.listObservations(poolAddress, { to: observedAt, order: 'descending', limit: 1 })[0] ?? null
  }

  predecessorObservation(poolAddress: Address, observedAt: Date): PoolSnapshot | null {
    validateTimestamp(observedAt, 'Observation predecessor timestamp')
    const row = this.#database
      .prepare(
        `
        SELECT ${OBSERVATION_COLUMNS}
        FROM pool_observations
        WHERE pool_address = ? AND observed_at < ?
        ORDER BY observed_at DESC, CAST(block_number AS INTEGER) DESC
        LIMIT 1
      `,
      )
      .get(getAddress(poolAddress), observedAt.toISOString()) as ObservationRow | undefined
    return row ? rowToSnapshot(row) : null
  }

  countObservations(poolAddress?: Address): number {
    if (poolAddress) {
      const row = this.#database
        .prepare('SELECT COUNT(*) AS count FROM pool_observations WHERE pool_address = ?')
        .get(getAddress(poolAddress)) as { count: number }
      return row.count
    }

    const row = this.#database.prepare('SELECT COUNT(*) AS count FROM pool_observations').get() as { count: number }
    return row.count
  }

  close(): void {
    this.#database.close()
  }
}

function validateQuery(query: PoolObservationQuery): number {
  const limit = query.limit ?? 1_000
  if (!Number.isInteger(limit) || limit <= 0 || limit > 10_000) {
    throw new RangeError('Observation query limit must be an integer between 1 and 10000')
  }
  if (query.fromBlock !== undefined && query.fromBlock < 0n) throw new RangeError('fromBlock must be non-negative')
  if (query.toBlock !== undefined && query.toBlock < 0n) throw new RangeError('toBlock must be non-negative')
  if (query.fromBlock !== undefined && query.toBlock !== undefined && query.fromBlock > query.toBlock) {
    throw new RangeError('fromBlock must not exceed toBlock')
  }
  if (query.from) validateTimestamp(query.from, 'Observation query from timestamp')
  if (query.to) validateTimestamp(query.to, 'Observation query to timestamp')
  if (query.from && query.to && query.from > query.to) throw new RangeError('Observation query from must not exceed to')
  if (query.order !== undefined && query.order !== 'ascending' && query.order !== 'descending') {
    throw new RangeError('Observation query order must be ascending or descending')
  }
  return limit
}

function validateTimestamp(value: Date, name: string): void {
  if (Number.isNaN(value.getTime())) throw new RangeError(`${name} is invalid`)
}

function rowToSnapshot(row: ObservationRow): PoolSnapshot {
  return {
    value: {
      poolAddress: getAddress(row.pool_address),
      token0: {
        chainId: row.chain_id,
        address: getAddress(row.token0_address),
        symbol: row.token0_symbol,
        decimals: row.token0_decimals,
      },
      token1: {
        chainId: row.chain_id,
        address: getAddress(row.token1_address),
        symbol: row.token1_symbol,
        decimals: row.token1_decimals,
      },
      feeTier: row.fee_tier as PoolSnapshot['value']['feeTier'],
      sqrtPriceX96: BigInt(row.sqrt_price_x96),
      tick: row.tick,
      tickSpacing: row.tick_spacing,
      activeLiquidity: BigInt(row.active_liquidity),
      ...(row.fee_growth_global0_x128 != null ? { feeGrowthGlobal0X128: BigInt(row.fee_growth_global0_x128) } : {}),
      ...(row.fee_growth_global1_x128 != null ? { feeGrowthGlobal1X128: BigInt(row.fee_growth_global1_x128) } : {}),
    },
    block: {
      chainId: row.chain_id,
      blockNumber: BigInt(row.block_number),
      observedAt: new Date(row.observed_at),
    },
    quality: parseQuality(row.quality),
    warnings: parseWarnings(row.warnings_json),
  }
}

function parseQuality(value: string): DataQuality {
  if (value === 'complete' || value === 'partial' || value === 'stale') return value
  throw new Error(`Invalid stored observation quality: ${value}`)
}

function parseWarnings(value: string): readonly string[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('Stored observation warnings are invalid')
  }
  return parsed
}
