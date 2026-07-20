import { DatabaseSync } from 'node:sqlite'
import type { Address } from 'viem'
import type { BlockHeader, CheckpointStore, IndexCheckpoint } from './indexer.js'
import type { IndexedSwap, SwapEventSink } from './swap-indexer.js'

export type TimestampedIndexedSwap = IndexedSwap & { observedAt: Date }

export type SwapTimeQuery = {
  from?: Date
  to?: Date
  limit?: number
}

export type SwapTimeQueryResult = {
  swaps: readonly TimestampedIndexedSwap[]
  totalMatching: number
  truncated: boolean
}

export class SqliteSwapIndexStore implements CheckpointStore, SwapEventSink {
  readonly #database: DatabaseSync

  constructor(path: string) {
    this.#database = new DatabaseSync(path)
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS swap_index_checkpoint (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        next_block TEXT NOT NULL,
        last_block_number TEXT,
        last_block_hash TEXT,
        last_parent_hash TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS swap_indexed_blocks (
        block_number TEXT PRIMARY KEY,
        block_hash TEXT NOT NULL,
        parent_hash TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS swap_block_times (
        block_number TEXT PRIMARY KEY,
        observed_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS swap_events (
        block_number TEXT NOT NULL,
        block_hash TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        pool_address TEXT NOT NULL,
        sender TEXT NOT NULL,
        recipient TEXT NOT NULL,
        amount0 TEXT NOT NULL,
        amount1 TEXT NOT NULL,
        sqrt_price_x96 TEXT NOT NULL,
        active_liquidity TEXT NOT NULL,
        tick INTEGER NOT NULL,
        PRIMARY KEY (transaction_hash, log_index)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS swap_events_pool_block
      ON swap_events(pool_address, CAST(block_number AS INTEGER));

      CREATE INDEX IF NOT EXISTS swap_block_times_observed_at
      ON swap_block_times(observed_at);
    `)
  }

  async load(): Promise<IndexCheckpoint | null> {
    await Promise.resolve()
    const row = this.#database
      .prepare(
        `
        SELECT next_block, last_block_number, last_block_hash, last_parent_hash
        FROM swap_index_checkpoint
        WHERE singleton = 1
      `,
      )
      .get() as
      | {
          next_block: string
          last_block_number: string | null
          last_block_hash: `0x${string}` | null
          last_parent_hash: `0x${string}` | null
        }
      | undefined

    if (!row) return null
    const lastProcessedBlock =
      row.last_block_number && row.last_block_hash && row.last_parent_hash
        ? {
            number: BigInt(row.last_block_number),
            hash: row.last_block_hash,
            parentHash: row.last_parent_hash,
          }
        : undefined
    return {
      nextBlock: BigInt(row.next_block),
      ...(lastProcessedBlock ? { lastProcessedBlock } : {}),
    }
  }

  async save(checkpoint: IndexCheckpoint): Promise<void> {
    await Promise.resolve()
    this.#database
      .prepare(
        `
        INSERT INTO swap_index_checkpoint (
          singleton, next_block, last_block_number, last_block_hash, last_parent_hash
        ) VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(singleton) DO UPDATE SET
          next_block = excluded.next_block,
          last_block_number = excluded.last_block_number,
          last_block_hash = excluded.last_block_hash,
          last_parent_hash = excluded.last_parent_hash
      `,
      )
      .run(
        checkpoint.nextBlock.toString(),
        checkpoint.lastProcessedBlock?.number.toString() ?? null,
        checkpoint.lastProcessedBlock?.hash ?? null,
        checkpoint.lastProcessedBlock?.parentHash ?? null,
      )
  }

  async replaceBlock(block: BlockHeader, events: readonly IndexedSwap[]): Promise<void> {
    await Promise.resolve()
    if (!block.observedAt || Number.isNaN(block.observedAt.getTime())) {
      throw new Error('Swap block header must include a valid observedAt timestamp')
    }
    this.#database.exec('BEGIN IMMEDIATE')
    try {
      this.#database.prepare('DELETE FROM swap_events WHERE block_number = ?').run(block.number.toString())
      this.#database.prepare('DELETE FROM swap_indexed_blocks WHERE block_number = ?').run(block.number.toString())
      this.#database.prepare('DELETE FROM swap_block_times WHERE block_number = ?').run(block.number.toString())
      this.#database
        .prepare('INSERT INTO swap_indexed_blocks (block_number, block_hash, parent_hash) VALUES (?, ?, ?)')
        .run(block.number.toString(), block.hash, block.parentHash)
      this.#database
        .prepare('INSERT INTO swap_block_times (block_number, observed_at) VALUES (?, ?)')
        .run(block.number.toString(), block.observedAt.toISOString())

      const insert = this.#database.prepare(`
        INSERT INTO swap_events (
          block_number, block_hash, transaction_hash, log_index,
          pool_address, sender, recipient, amount0, amount1,
          sqrt_price_x96, active_liquidity, tick
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const event of events) {
        insert.run(
          event.blockNumber.toString(),
          event.blockHash,
          event.transactionHash,
          event.logIndex,
          event.poolAddress,
          event.sender,
          event.recipient,
          event.amount0.toString(),
          event.amount1.toString(),
          event.sqrtPriceX96.toString(),
          event.activeLiquidity.toString(),
          event.tick,
        )
      }
      this.#database.exec('COMMIT')
    } catch (error) {
      this.#database.exec('ROLLBACK')
      throw error
    }
  }

  async deleteFromBlock(blockNumber: bigint): Promise<void> {
    await Promise.resolve()
    this.#database.exec('BEGIN IMMEDIATE')
    try {
      this.#database
        .prepare('DELETE FROM swap_events WHERE CAST(block_number AS INTEGER) >= CAST(? AS INTEGER)')
        .run(blockNumber.toString())
      this.#database
        .prepare('DELETE FROM swap_indexed_blocks WHERE CAST(block_number AS INTEGER) >= CAST(? AS INTEGER)')
        .run(blockNumber.toString())
      this.#database
        .prepare('DELETE FROM swap_block_times WHERE CAST(block_number AS INTEGER) >= CAST(? AS INTEGER)')
        .run(blockNumber.toString())
      this.#database.exec('COMMIT')
    } catch (error) {
      this.#database.exec('ROLLBACK')
      throw error
    }
  }

  countSwaps(poolAddress?: Address): number {
    if (poolAddress) {
      const row = this.#database
        .prepare('SELECT COUNT(*) AS count FROM swap_events WHERE pool_address = ?')
        .get(poolAddress) as { count: number }
      return row.count
    }
    const row = this.#database.prepare('SELECT COUNT(*) AS count FROM swap_events').get() as { count: number }
    return row.count
  }

  listSwaps(poolAddress: Address, limit = 1_000): readonly IndexedSwap[] {
    return this.listSwapsByTime(poolAddress, { limit }).swaps
  }

  listSwapsByTime(poolAddress: Address, query: SwapTimeQuery = {}): SwapTimeQueryResult {
    const limit = query.limit ?? 10_000
    if (!Number.isInteger(limit) || limit <= 0 || limit > 10_000) {
      throw new RangeError('Swap query limit must be an integer between 1 and 10000')
    }
    if (query.from && Number.isNaN(query.from.getTime())) throw new RangeError('Swap query from timestamp is invalid')
    if (query.to && Number.isNaN(query.to.getTime())) throw new RangeError('Swap query to timestamp is invalid')
    if (query.from && query.to && query.from > query.to) throw new RangeError('Swap query from must not exceed to')

    const from = query.from?.toISOString() ?? '0000-01-01T00:00:00.000Z'
    const to = query.to?.toISOString() ?? '9999-12-31T23:59:59.999Z'
    const totalRow = this.#database
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM swap_events event
        JOIN swap_block_times time ON time.block_number = event.block_number
        WHERE event.pool_address = ? AND time.observed_at >= ? AND time.observed_at <= ?
      `,
      )
      .get(poolAddress, from, to) as { count: number }

    const rows = this.#database
      .prepare(
        `
        SELECT event.block_number, event.block_hash, event.transaction_hash, event.log_index,
               event.pool_address, event.sender, event.recipient, event.amount0, event.amount1,
               event.sqrt_price_x96, event.active_liquidity, event.tick, time.observed_at
        FROM swap_events event
        JOIN swap_block_times time ON time.block_number = event.block_number
        WHERE event.pool_address = ? AND time.observed_at >= ? AND time.observed_at <= ?
        ORDER BY time.observed_at, CAST(event.block_number AS INTEGER), event.log_index
        LIMIT ?
      `,
      )
      .all(poolAddress, from, to, limit) as SwapRow[]

    return {
      swaps: rows.map(rowToTimestampedSwap),
      totalMatching: totalRow.count,
      truncated: totalRow.count > rows.length,
    }
  }

  latestSwapTime(): Date | null {
    const row = this.#database.prepare('SELECT MAX(observed_at) AS observed_at FROM swap_block_times').get() as {
      observed_at: string | null
    }
    return row.observed_at ? new Date(row.observed_at) : null
  }

  close(): void {
    this.#database.close()
  }
}

type SwapRow = {
  block_number: string
  block_hash: `0x${string}`
  transaction_hash: `0x${string}`
  log_index: number
  pool_address: Address
  sender: Address
  recipient: Address
  amount0: string
  amount1: string
  sqrt_price_x96: string
  active_liquidity: string
  tick: number
  observed_at: string
}

function rowToTimestampedSwap(row: SwapRow): TimestampedIndexedSwap {
  return {
    poolAddress: row.pool_address,
    sender: row.sender,
    recipient: row.recipient,
    amount0: BigInt(row.amount0),
    amount1: BigInt(row.amount1),
    sqrtPriceX96: BigInt(row.sqrt_price_x96),
    activeLiquidity: BigInt(row.active_liquidity),
    tick: row.tick,
    blockNumber: BigInt(row.block_number),
    blockHash: row.block_hash,
    transactionHash: row.transaction_hash,
    logIndex: row.log_index,
    observedAt: new Date(row.observed_at),
  }
}
