import { DatabaseSync } from 'node:sqlite'
import type { BlockHeader, CheckpointStore, IndexCheckpoint, IndexedPoolCreated, PoolEventSink } from './indexer.js'

export class SqlitePoolIndexStore implements CheckpointStore, PoolEventSink {
  readonly #database: DatabaseSync

  constructor(path: string) {
    this.#database = new DatabaseSync(path)
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS index_checkpoint (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        next_block TEXT NOT NULL,
        last_block_number TEXT,
        last_block_hash TEXT,
        last_parent_hash TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS indexed_blocks (
        block_number TEXT PRIMARY KEY,
        block_hash TEXT NOT NULL,
        parent_hash TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS pool_created_events (
        block_number TEXT NOT NULL,
        block_hash TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        pool_address TEXT NOT NULL,
        token0 TEXT NOT NULL,
        token1 TEXT NOT NULL,
        fee_tier INTEGER NOT NULL,
        tick_spacing INTEGER NOT NULL,
        PRIMARY KEY (transaction_hash, log_index)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS pool_created_events_block
      ON pool_created_events(block_number);
    `)
  }

  async load(): Promise<IndexCheckpoint | null> {
    const row = this.#database
      .prepare(`
        SELECT next_block, last_block_number, last_block_hash, last_parent_hash
        FROM index_checkpoint
        WHERE singleton = 1
      `)
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
    this.#database
      .prepare(`
        INSERT INTO index_checkpoint (
          singleton, next_block, last_block_number, last_block_hash, last_parent_hash
        ) VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(singleton) DO UPDATE SET
          next_block = excluded.next_block,
          last_block_number = excluded.last_block_number,
          last_block_hash = excluded.last_block_hash,
          last_parent_hash = excluded.last_parent_hash
      `)
      .run(
        checkpoint.nextBlock.toString(),
        checkpoint.lastProcessedBlock?.number.toString() ?? null,
        checkpoint.lastProcessedBlock?.hash ?? null,
        checkpoint.lastProcessedBlock?.parentHash ?? null,
      )
  }

  async replaceBlock(block: BlockHeader, events: readonly IndexedPoolCreated[]): Promise<void> {
    this.#database.exec('BEGIN IMMEDIATE')
    try {
      this.#database
        .prepare('DELETE FROM pool_created_events WHERE block_number = ?')
        .run(block.number.toString())
      this.#database
        .prepare('DELETE FROM indexed_blocks WHERE block_number = ?')
        .run(block.number.toString())
      this.#database
        .prepare('INSERT INTO indexed_blocks (block_number, block_hash, parent_hash) VALUES (?, ?, ?)')
        .run(block.number.toString(), block.hash, block.parentHash)

      const insert = this.#database.prepare(`
        INSERT INTO pool_created_events (
          block_number, block_hash, transaction_hash, log_index,
          pool_address, token0, token1, fee_tier, tick_spacing
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const event of events) {
        insert.run(
          event.blockNumber.toString(),
          event.blockHash,
          event.transactionHash,
          event.logIndex,
          event.poolAddress,
          event.token0,
          event.token1,
          event.feeTier,
          event.tickSpacing,
        )
      }
      this.#database.exec('COMMIT')
    } catch (error) {
      this.#database.exec('ROLLBACK')
      throw error
    }
  }

  async deleteFromBlock(blockNumber: bigint): Promise<void> {
    this.#database.exec('BEGIN IMMEDIATE')
    try {
      this.#database
        .prepare('DELETE FROM pool_created_events WHERE CAST(block_number AS INTEGER) >= ?')
        .run(blockNumber)
      this.#database
        .prepare('DELETE FROM indexed_blocks WHERE CAST(block_number AS INTEGER) >= ?')
        .run(blockNumber)
      this.#database.exec('COMMIT')
    } catch (error) {
      this.#database.exec('ROLLBACK')
      throw error
    }
  }

  listPools(): readonly IndexedPoolCreated[] {
    const rows = this.#database
      .prepare(`
        SELECT block_number, block_hash, transaction_hash, log_index,
               pool_address, token0, token1, fee_tier, tick_spacing
        FROM pool_created_events
        ORDER BY CAST(block_number AS INTEGER), log_index
      `)
      .all() as Array<{
      block_number: string
      block_hash: `0x${string}`
      transaction_hash: `0x${string}`
      log_index: number
      pool_address: `0x${string}`
      token0: `0x${string}`
      token1: `0x${string}`
      fee_tier: number
      tick_spacing: number
    }>

    return rows.map((row) => ({
      blockNumber: BigInt(row.block_number),
      blockHash: row.block_hash,
      transactionHash: row.transaction_hash,
      logIndex: row.log_index,
      poolAddress: row.pool_address,
      token0: row.token0,
      token1: row.token1,
      feeTier: row.fee_tier,
      tickSpacing: row.tick_spacing,
    }))
  }

  close(): void {
    this.#database.close()
  }
}
