import { describe, expect, it } from 'vitest'
import type { BlockHeader, CheckpointStore, IndexCheckpoint } from './indexer.js'
import { backfillSwapEvents } from './swap-backfill.js'
import type { IndexedSwap, SwapEventSink, SwapEventSource } from './swap-indexer.js'

const hash = (value: number): `0x${string}` => `0x${value.toString(16).padStart(64, '0')}`
const address = (value: number): `0x${string}` => `0x${value.toString(16).padStart(40, '0')}`

function header(number: bigint): BlockHeader {
  return {
    number,
    hash: hash(Number(number)),
    parentHash: hash(Number(number - 1n)),
    observedAt: new Date(`2026-07-20T10:00:${(Number(number) % 60).toString().padStart(2, '0')}.000Z`),
  }
}

function swap(blockNumber: bigint, logIndex = 0): IndexedSwap {
  return {
    poolAddress: address(1),
    sender: address(2),
    recipient: address(3),
    amount0: -1000n,
    amount1: 500n,
    sqrtPriceX96: 1n << 96n,
    activeLiquidity: 1_000_000n,
    tick: -10,
    blockNumber,
    blockHash: hash(Number(blockNumber)),
    transactionHash: hash(10_000 + Number(blockNumber) * 100 + logIndex),
    logIndex,
  }
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

function fakeSource(args: {
  head: bigint
  swaps: readonly IndexedSwap[]
  headerOverride?: (blockNumber: bigint) => BlockHeader
}): SwapEventSource & { calls: { ranges: [bigint, bigint][]; headers: bigint[] } } {
  const calls: { ranges: [bigint, bigint][]; headers: bigint[] } = { ranges: [], headers: [] }
  return {
    calls,
    async getHeadBlockNumber() {
      return args.head
    },
    async getBlockHeader(blockNumber: bigint) {
      calls.headers.push(blockNumber)
      return args.headerOverride ? args.headerOverride(blockNumber) : header(blockNumber)
    },
    async getSwapEvents(fromBlock: bigint, toBlock: bigint) {
      calls.ranges.push([fromBlock, toBlock])
      return args.swaps.filter((s) => s.blockNumber >= fromBlock && s.blockNumber <= toBlock)
    },
  }
}

function memorySink(): SwapEventSink & { blocks: Map<bigint, readonly IndexedSwap[]> } {
  const blocks = new Map<bigint, readonly IndexedSwap[]>()
  return {
    blocks,
    async replaceBlock(block: BlockHeader, events: readonly IndexedSwap[]) {
      blocks.set(block.number, events)
    },
    async deleteFromBlock(blockNumber: bigint) {
      for (const key of blocks.keys()) if (key >= blockNumber) blocks.delete(key)
    },
  }
}

describe('swap backfill', () => {
  it('backfills whole range in spans, storing only swap-bearing blocks', async () => {
    const swaps = [swap(105n), swap(105n, 1), swap(220n)]
    const source = fakeSource({ head: 1_000n, swaps })
    const sink = memorySink()
    const checkpoint = memoryCheckpoint()

    const result = await backfillSwapEvents({
      source,
      checkpoints: checkpoint.store,
      sink,
      options: { startBlock: 100n, safetyLag: 500n, maxBlockSpan: 200n },
    })

    // spans of 200 up to endBlock = 1000 - 500 = 500
    expect(source.calls.ranges).toEqual([
      [100n, 299n],
      [300n, 499n],
      [500n, 500n],
    ])
    // headers fetched only for swap-bearing blocks
    expect(source.calls.headers).toEqual([105n, 220n])
    expect(sink.blocks.get(105n)).toHaveLength(2)
    expect(sink.blocks.get(220n)).toHaveLength(1)
    expect(sink.blocks.size).toBe(2)
    expect(result.eventsWritten).toBe(3)
    expect(result.processedFrom).toBe(100n)
    expect(result.processedTo).toBe(500n)
    // checkpoint advanced past end, without lastProcessedBlock chain state
    expect(checkpoint.read()).toEqual({ nextBlock: 501n })
  })

  it('resumes from an existing checkpoint', async () => {
    const source = fakeSource({ head: 1_000n, swaps: [] })
    const sink = memorySink()
    const checkpoint = memoryCheckpoint({ nextBlock: 400n })

    const result = await backfillSwapEvents({
      source,
      checkpoints: checkpoint.store,
      sink,
      options: { startBlock: 100n, safetyLag: 500n, maxBlockSpan: 1_000n },
    })

    expect(source.calls.ranges).toEqual([[400n, 500n]])
    expect(result.processedFrom).toBe(400n)
    expect(checkpoint.read()).toEqual({ nextBlock: 501n })
  })

  it('is a no-op when the confirmed range is already indexed', async () => {
    const source = fakeSource({ head: 1_000n, swaps: [swap(105n)] })
    const sink = memorySink()
    const checkpoint = memoryCheckpoint({ nextBlock: 501n })

    const result = await backfillSwapEvents({
      source,
      checkpoints: checkpoint.store,
      sink,
      options: { startBlock: 100n, safetyLag: 500n },
    })

    expect(source.calls.ranges).toEqual([])
    expect(result.eventsWritten).toBe(0)
    expect(result.processedFrom).toBeNull()
    expect(checkpoint.read()).toEqual({ nextBlock: 501n })
  })

  it('fails closed when a swap log block hash does not match the canonical header', async () => {
    const source = fakeSource({
      head: 1_000n,
      swaps: [swap(105n)],
      headerOverride: (blockNumber) => ({ ...header(blockNumber), hash: hash(999) }),
    })
    const sink = memorySink()
    const checkpoint = memoryCheckpoint()

    await expect(
      backfillSwapEvents({
        source,
        checkpoints: checkpoint.store,
        sink,
        options: { startBlock: 100n, safetyLag: 500n },
      }),
    ).rejects.toThrow(/block hash mismatch/i)
    expect(sink.blocks.size).toBe(0)
  })

  it('rejects invalid options', async () => {
    const source = fakeSource({ head: 1_000n, swaps: [] })
    const sink = memorySink()
    const checkpoint = memoryCheckpoint()

    await expect(
      backfillSwapEvents({
        source,
        checkpoints: checkpoint.store,
        sink,
        options: { startBlock: 100n, safetyLag: -1n },
      }),
    ).rejects.toThrow(/safetyLag/)
    await expect(
      backfillSwapEvents({
        source,
        checkpoints: checkpoint.store,
        sink,
        options: { startBlock: 100n, maxBlockSpan: 0n },
      }),
    ).rejects.toThrow(/maxBlockSpan/)
  })
})
