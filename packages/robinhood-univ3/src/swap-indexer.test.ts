import { describe, expect, it } from 'vitest'
import type { BlockHeader, CheckpointStore, IndexCheckpoint } from './indexer.js'
import { normalizeSwapLog } from './swap-event-source.js'
import { syncSwapEvents, type SwapEventSink, type SwapEventSource } from './swap-indexer.js'
import { SqliteSwapIndexStore } from './swap-store.js'

const hash = (value: number): `0x${string}` => `0x${value.toString(16).padStart(64, '0')}`
const address = (value: number): `0x${string}` => `0x${value.toString(16).padStart(40, '0')}`

function header(number: bigint): BlockHeader {
  return {
    number,
    hash: hash(Number(number)),
    parentHash: hash(Number(number - 1n)),
    observedAt: new Date(`2026-07-20T10:${number.toString().padStart(2, '0')}:00.000Z`),
  }
}

function swap(blockNumber = 10n, logIndex = 4) {
  return normalizeSwapLog({
    poolAddress: address(1),
    sender: address(2),
    recipient: address(3),
    amount0: -1234567890123456789n,
    amount1: 987654321n,
    sqrtPriceX96: 1n << 96n,
    activeLiquidity: 999999999999999999n,
    tick: -123,
    blockNumber,
    blockHash: hash(Number(blockNumber)),
    transactionHash: hash(100 + Number(blockNumber) + logIndex),
    logIndex,
  })
}

function memoryCheckpoint(initial: IndexCheckpoint | null = null): {
  store: CheckpointStore
  read: () => IndexCheckpoint | null
} {
  let value = initial
  return {
    store: {
      async load() {
        return value
      },
      async save(checkpoint) {
        value = checkpoint
      },
    },
    read: () => value,
  }
}

describe('swap ingestion', () => {
  it('normalizes canonical fields and rejects malformed deltas', () => {
    expect(swap().amount0).toBe(-1234567890123456789n)
    expect(() =>
      normalizeSwapLog({
        ...swap(),
        amount0: 0n,
        amount1: 1n,
      }),
    ).toThrow(/both be non-zero/)
    expect(() =>
      normalizeSwapLog({
        ...swap(),
        amount0: 1n,
        amount1: 1n,
      }),
    ).toThrow(/opposite signs/)
  })

  it('round-trips signed amounts and large state values through SQLite', async () => {
    const store = new SqliteSwapIndexStore(':memory:')
    await store.replaceBlock(header(10n), [swap()])

    const rows = store.listSwaps(address(1))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.amount0).toBe(-1234567890123456789n)
    expect(rows[0]?.amount1).toBe(987654321n)
    expect(rows[0]?.activeLiquidity).toBe(999999999999999999n)
    expect(store.countSwaps()).toBe(1)
    store.close()
  })

  it('supports timestamp windows and reports truncation', async () => {
    const store = new SqliteSwapIndexStore(':memory:')
    await store.replaceBlock(header(10n), [swap(10n, 1), swap(10n, 2)])
    await store.replaceBlock(header(11n), [swap(11n, 1)])

    const result = store.listSwapsByTime(address(1), {
      from: new Date('2026-07-20T10:10:00.000Z'),
      to: new Date('2026-07-20T10:10:00.000Z'),
      limit: 1,
    })
    expect(result.totalMatching).toBe(2)
    expect(result.swaps).toHaveLength(1)
    expect(result.truncated).toBe(true)
    expect(result.swaps[0]?.observedAt.toISOString()).toBe('2026-07-20T10:10:00.000Z')
    expect(store.latestSwapTime()?.toISOString()).toBe('2026-07-20T10:11:00.000Z')
    store.close()
  })

  it('processes only confirmed blocks and persists progress', async () => {
    const checkpoints = memoryCheckpoint()
    const replaced: bigint[] = []
    const source: SwapEventSource = {
      async getHeadBlockNumber() {
        return 20n
      },
      async getBlockHeader(blockNumber) {
        return header(blockNumber)
      },
      async getSwapEvents(fromBlock) {
        return fromBlock === 10n ? [swap(10n)] : []
      },
    }
    const sink: SwapEventSink = {
      async replaceBlock(block) {
        replaced.push(block.number)
      },
      async deleteFromBlock() {},
    }

    const result = await syncSwapEvents({
      source,
      checkpoints: checkpoints.store,
      sink,
      options: { startBlock: 10n, confirmationDepth: 5n, maxBlockSpan: 2n },
    })

    expect(replaced).toEqual([10n, 11n])
    expect(result.eventsWritten).toBe(1)
    expect(checkpoints.read()?.nextBlock).toBe(12n)
  })
})
