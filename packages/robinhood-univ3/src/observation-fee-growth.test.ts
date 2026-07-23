import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PoolSnapshot } from './index.js'
import { SqlitePoolObservationStore } from './observation-store.js'

const poolAddress = '0x0000000000000000000000000000000000000010'
const baseTime = Date.parse('2026-07-20T10:00:00.000Z')

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
        decimals: 6,
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
      observedAt: new Date(baseTime + Number(blockNumber)),
    },
    quality: 'complete',
    warnings: [],
  }
}

describe('pool observation fee growth', () => {
  it('round-trips feeGrowthGlobal accumulators through SQLite', () => {
    const store = new SqlitePoolObservationStore(':memory:')
    store.saveSnapshots([
      snapshot(1n, {
        feeGrowthGlobal0X128: 123456789012345678901234567890n,
        feeGrowthGlobal1X128: 42n,
      }),
    ])

    const [observation] = store.listObservations(poolAddress)
    expect(observation?.value.feeGrowthGlobal0X128).toBe(123456789012345678901234567890n)
    expect(observation?.value.feeGrowthGlobal1X128).toBe(42n)
    store.close()
  })

  it('stores snapshots without fee growth as undefined', () => {
    const store = new SqlitePoolObservationStore(':memory:')
    store.saveSnapshots([snapshot(1n)])

    const [observation] = store.listObservations(poolAddress)
    expect(observation?.value.feeGrowthGlobal0X128).toBeUndefined()
    expect(observation?.value.feeGrowthGlobal1X128).toBeUndefined()
    store.close()
  })

  it('migrates a pre-existing database created without fee growth columns', () => {
    const path = join(tmpdir(), `lp-mine-obs-migration-${process.pid}-${Date.now()}.sqlite`)

    // simulate a database created by the previous schema
    const legacy = new DatabaseSync(path)
    legacy.exec(`
      CREATE TABLE pool_observations (
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
        quality TEXT NOT NULL CHECK (quality IN ('complete', 'partial', 'stale')),
        warnings_json TEXT NOT NULL,
        PRIMARY KEY (pool_address, block_number)
      ) STRICT;
    `)
    legacy
      .prepare(
        `INSERT INTO pool_observations VALUES (
          4663, '${poolAddress}', '1', '2026-07-20T10:00:00.001Z',
          '0x0000000000000000000000000000000000000001', 'WETH', 18,
          '0x0000000000000000000000000000000000000002', 'USDG', 6,
          500, '${(1n << 96n).toString()}', 0, 10, '100', 'complete', '[]'
        )`,
      )
      .run()
    legacy.close()

    // opening the store migrates, old rows read back with undefined fee growth
    const store = new SqlitePoolObservationStore(path)
    const [legacyRow] = store.listObservations(poolAddress)
    expect(legacyRow?.value.activeLiquidity).toBe(100n)
    expect(legacyRow?.value.feeGrowthGlobal0X128).toBeUndefined()

    // and new rows persist fee growth
    store.saveSnapshots([snapshot(2n, { feeGrowthGlobal0X128: 7n, feeGrowthGlobal1X128: 9n })])
    const rows = store.listObservations(poolAddress)
    expect(rows[1]?.value.feeGrowthGlobal0X128).toBe(7n)
    expect(rows[1]?.value.feeGrowthGlobal1X128).toBe(9n)
    store.close()
  })
})
