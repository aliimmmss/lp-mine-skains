import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ROBINHOOD_TOKENS,
  ROBINHOOD_WETH_USDG_POOLS,
  SqlitePoolObservationStore,
  type PoolSnapshot,
} from '@lp-mine/robinhood-univ3'
import { buildPoolFeeReport } from './pools-fees.js'

const Q96 = 1n << 96n
const Q128 = 1n << 128n
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lp-mine-pools-fees-'))
  directories.push(directory)
  return join(directory, 'observations.sqlite')
}

const pool500 = ROBINHOOD_WETH_USDG_POOLS.find((pool) => pool.feeTier === 500)!

function snapshot(
  blockNumber: bigint,
  observedAt: string,
  feeGrowth0: bigint | undefined,
  feeGrowth1: bigint | undefined,
): PoolSnapshot {
  return {
    value: {
      poolAddress: pool500.poolAddress,
      token0: { chainId: 4663, address: ROBINHOOD_TOKENS.wrappedNative, symbol: 'WETH', decimals: 18 },
      token1: { chainId: 4663, address: ROBINHOOD_TOKENS.usdg, symbol: 'USDG', decimals: 6 },
      feeTier: 500,
      sqrtPriceX96: Q96,
      tick: 0,
      tickSpacing: 10,
      activeLiquidity: 1_000_000n,
      ...(feeGrowth0 !== undefined ? { feeGrowthGlobal0X128: feeGrowth0 } : {}),
      ...(feeGrowth1 !== undefined ? { feeGrowthGlobal1X128: feeGrowth1 } : {}),
    },
    block: { chainId: 4663, blockNumber, observedAt: new Date(observedAt) },
    quality: 'complete',
    warnings: [],
  }
}

describe('buildPoolFeeReport', () => {
  it('reports insufficient for pools with fewer than two fee-growth samples', () => {
    const path = databasePath()
    const store = new SqlitePoolObservationStore(path)
    store.saveSnapshots([snapshot(1n, '2026-07-23T00:00:00.000Z', undefined, undefined)])
    store.close()

    const report = buildPoolFeeReport(
      { databasePath: path, windowSeconds: 86_400, referenceLiquidity: 10n ** 18n, limit: 10_000 },
      new Date('2026-07-23T12:00:00.000Z'),
    )
    const pool = report.pools.find((entry) => entry.feeTier === 500)!
    expect(pool.status).toBe('insufficient')
    expect(pool.dailyFeesCombinedInToken1Decimal).toBeNull()
  })

  it('computes daily fee yield from the widest fee-growth pair within the window', () => {
    const path = databasePath()
    const store = new SqlitePoolObservationStore(path)
    store.saveSnapshots([
      snapshot(1n, '2026-07-23T00:00:00.000Z', 0n, 0n),
      snapshot(2n, '2026-07-23T06:00:00.000Z', Q128 / 2n, Q128), // ignored middle point
      snapshot(3n, '2026-07-23T12:00:00.000Z', Q128, 2n * Q128), // 43200s span from first
    ])
    store.close()

    const report = buildPoolFeeReport(
      { databasePath: path, windowSeconds: 86_400, referenceLiquidity: 10n ** 18n, limit: 10_000 },
      new Date('2026-07-23T12:00:00.000Z'),
    )
    const pool = report.pools.find((entry) => entry.feeTier === 500)!
    expect(pool.status).toBe('complete')
    expect(pool.windowSeconds).toBe(43_200)
    expect(pool.sampleCount).toBe(3)
    // occupancy is computed from all snapshots at the current (latest) tick 0
    expect(pool.occupancy?.sampleCount).toBe(3)
    expect(pool.occupancy?.bands.find((band) => band.label === '±1%')?.observationsInRange).toBe(3)
    // Δfg0=Q128 over 43200s, REF 1e18 -> 1e18 token0/window -> 2e18/day
    expect(pool.dailyFeesToken0Decimal).toBe('2000000000000000000.00000000')
    expect(pool.dailyFeesCombinedInToken1Decimal).toBe('6000000000000000000.00000000')
  })

  it('ranks pools by combined daily fees, highest first', () => {
    const path = databasePath()
    const store = new SqlitePoolObservationStore(path)
    // only seed the 500 pool with data; others are insufficient and sort last
    store.saveSnapshots([
      snapshot(1n, '2026-07-23T00:00:00.000Z', 0n, 0n),
      snapshot(2n, '2026-07-23T12:00:00.000Z', Q128, 0n),
    ])
    store.close()

    const report = buildPoolFeeReport(
      { databasePath: path, windowSeconds: 86_400, referenceLiquidity: 10n ** 18n, limit: 10_000 },
      new Date('2026-07-23T12:00:00.000Z'),
    )
    expect(report.pools[0]!.feeTier).toBe(500)
    expect(report.pools[0]!.status).toBe('complete')
    expect(report.pools.slice(1).every((entry) => entry.status === 'insufficient')).toBe(true)
  })
})
