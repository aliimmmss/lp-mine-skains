import { describe, expect, it } from 'vitest'
import type { PoolSnapshot } from './index.js'
import { SqlitePoolObservationStore } from './observation-store.js'

const poolAddress = '0x0000000000000000000000000000000000000010'

function snapshot(blockNumber: bigint, overrides: Partial<PoolSnapshot['value']> = {}): PoolSnapshot {
  return {
    value: {
      poolAddress,
      token0: {
        chainId: 4663,
        address: '0x0000000000000000000000000000000000000001',
        symbol: 'WETH',
        decimals: 18,
      },
      token1: {
        chainId: 4663,
        address: '0x0000000000000000000000000000000000000002',
        symbol: 'USDG',
        decimals: 18,
      },
      feeTier: 500,
      sqrtPriceX96: 1n << 96n,
      tick: 0,
      tickSpacing: 10,
      activeLiquidity: 100n,
      ...overrides,
    },
    block: {
      chainId: 4663,
      blockNumber,
      observedAt: new Date(`2026-07-20T10:00:${blockNumber.toString().padStart(2, '0')}.000Z`),
    },
    quality: 'complete',
    warnings: [],
  }
}

describe('SqlitePoolObservationStore', () => {
  it('persists and restores exact bigint pool snapshots', () => {
    const store = new SqlitePoolObservationStore(':memory:')
    store.saveSnapshots([snapshot(1n), snapshot(2n, { activeLiquidity: 250n, tick: 12 })])

    const observations = store.listObservations(poolAddress)
    expect(observations).toHaveLength(2)
    expect(observations[1]?.value.activeLiquidity).toBe(250n)
    expect(observations[1]?.value.tick).toBe(12)
    expect(observations[1]?.block.blockNumber).toBe(2n)
    store.close()
  })

  it('is idempotent per pool and block and updates corrected observations', () => {
    const store = new SqlitePoolObservationStore(':memory:')
    store.saveSnapshots([snapshot(1n)])
    store.saveSnapshots([snapshot(1n, { activeLiquidity: 999n })])

    expect(store.countObservations()).toBe(1)
    expect(store.listObservations(poolAddress)[0]?.value.activeLiquidity).toBe(999n)
    store.close()
  })

  it('supports bounded block queries and validates limits', () => {
    const store = new SqlitePoolObservationStore(':memory:')
    store.saveSnapshots([snapshot(1n), snapshot(2n), snapshot(3n)])

    expect(store.listObservations(poolAddress, { fromBlock: 2n, toBlock: 3n, limit: 1 })).toHaveLength(1)
    expect(() => store.listObservations(poolAddress, { limit: 0 })).toThrow(/limit/)
    store.close()
  })
})
