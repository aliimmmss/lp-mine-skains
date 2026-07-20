import { afterEach, describe, expect, it } from 'vitest'
import type { BlockHeader, IndexedPoolCreated } from './indexer.js'
import { SqlitePoolIndexStore } from './sqlite-store.js'

const stores: SqlitePoolIndexStore[] = []

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

function createStore(): SqlitePoolIndexStore {
  const store = new SqlitePoolIndexStore(':memory:')
  stores.push(store)
  return store
}

const block: BlockHeader = {
  number: 100n,
  hash: `0x${'11'.repeat(32)}`,
  parentHash: `0x${'22'.repeat(32)}`,
}

const event: IndexedPoolCreated = {
  blockNumber: block.number,
  blockHash: block.hash,
  transactionHash: `0x${'33'.repeat(32)}`,
  logIndex: 0,
  poolAddress: `0x${'44'.repeat(20)}`,
  token0: `0x${'55'.repeat(20)}`,
  token1: `0x${'66'.repeat(20)}`,
  feeTier: 3000,
  tickSpacing: 60,
}

describe('SqlitePoolIndexStore', () => {
  it('persists checkpoints without losing bigint precision', async () => {
    const store = createStore()
    const nextBlock = 9_007_199_254_740_993n

    await store.save({ nextBlock, lastProcessedBlock: block })

    await expect(store.load()).resolves.toEqual({
      nextBlock,
      lastProcessedBlock: block,
    })
  })

  it('replaces all events for a block atomically', async () => {
    const store = createStore()

    await store.replaceBlock(block, [event])
    await store.replaceBlock(block, [{ ...event, feeTier: 500 }])

    expect(store.listPools()).toEqual([{ ...event, feeTier: 500 }])
  })

  it('deletes indexed data from a reorg boundary', async () => {
    const store = createStore()
    const nextBlock = {
      number: 101n,
      hash: `0x${'77'.repeat(32)}`,
      parentHash: block.hash,
    } satisfies BlockHeader

    await store.replaceBlock(block, [event])
    await store.replaceBlock(nextBlock, [
      {
        ...event,
        blockNumber: nextBlock.number,
        blockHash: nextBlock.hash,
        transactionHash: `0x${'88'.repeat(32)}`,
      },
    ])
    await store.deleteFromBlock(101n)

    expect(store.listPools()).toEqual([event])
  })
})
