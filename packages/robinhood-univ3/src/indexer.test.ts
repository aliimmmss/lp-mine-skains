import { describe, expect, it } from 'vitest'
import type { BlockHeader, CheckpointStore, IndexCheckpoint, PoolCreatedEventSource, PoolEventSink } from './indexer.js'
import { syncPoolCreatedEvents } from './indexer.js'

const hash = (value: number): `0x${string}` => `0x${value.toString(16).padStart(64, '0')}`

function header(number: bigint, hashValue: number, parentHashValue: number): BlockHeader {
  return {
    number,
    hash: hash(hashValue),
    parentHash: hash(parentHashValue),
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

describe('syncPoolCreatedEvents', () => {
  it('only processes confirmed blocks and persists progress', async () => {
    const checkpoints = memoryCheckpoint()
    const replaced: bigint[] = []
    const source: PoolCreatedEventSource = {
      async getHeadBlockNumber() {
        return 20n
      },
      async getBlockHeader(blockNumber) {
        return header(blockNumber, Number(blockNumber), Number(blockNumber - 1n))
      },
      async getPoolCreatedEvents() {
        return []
      },
    }
    const sink: PoolEventSink = {
      async replaceBlock(block) {
        replaced.push(block.number)
      },
      async deleteFromBlock() {},
    }

    const result = await syncPoolCreatedEvents({
      source,
      checkpoints: checkpoints.store,
      sink,
      options: { startBlock: 10n, confirmationDepth: 5n, maxBlockSpan: 3n },
    })

    expect(replaced).toEqual([10n, 11n, 12n])
    expect(result.processedFrom).toBe(10n)
    expect(result.processedTo).toBe(12n)
    expect(checkpoints.read()?.nextBlock).toBe(13n)
  })

  it('rewinds when the stored block hash is no longer canonical', async () => {
    const checkpoints = memoryCheckpoint({
      nextBlock: 13n,
      lastProcessedBlock: header(12n, 99, 11),
    })
    const deleted: bigint[] = []
    const source: PoolCreatedEventSource = {
      async getHeadBlockNumber() {
        return 20n
      },
      async getBlockHeader(blockNumber) {
        return header(blockNumber, Number(blockNumber), Number(blockNumber - 1n))
      },
      async getPoolCreatedEvents() {
        return []
      },
    }
    const sink: PoolEventSink = {
      async replaceBlock() {},
      async deleteFromBlock(blockNumber) {
        deleted.push(blockNumber)
      },
    }

    const result = await syncPoolCreatedEvents({
      source,
      checkpoints: checkpoints.store,
      sink,
      options: { startBlock: 10n, confirmationDepth: 5n, maxBlockSpan: 1n },
    })

    expect(deleted).toEqual([12n])
    expect(result.rewoundFrom).toBe(12n)
    expect(result.processedFrom).toBe(12n)
  })
})
