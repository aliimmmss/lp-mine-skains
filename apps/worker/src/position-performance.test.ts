import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_TOKENS,
  ROBINHOOD_WETH_USDG_POOLS,
  SqlitePoolObservationStore,
  SqliteSwapIndexStore,
  normalizeSwapLog,
  type BlockHeader,
  type PoolSnapshot,
} from '@lp-mine/robinhood-univ3'
import { buildPositionPerformanceReport } from './position-performance.js'
import type { PositionFeeShareReportConfig } from './position-fee-share-config.js'

const directories: string[] = []
const pool = ROBINHOOD_WETH_USDG_POOLS.find((candidate) => candidate.feeTier === 500)!
const hash = (value: number): `0x${string}` => `0x${value.toString(16).padStart(64, '0')}`
const provenance = {
  source: 'wallet-reconciliation',
  observedAt: new Date('2026-07-20T10:30:00.000Z'),
  reference: 'batch-42',
}

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lp-mine-position-performance-'))
  directories.push(directory)
  return join(directory, 'evidence.sqlite')
}

function snapshot(blockNumber: bigint, observedAt: string, tick: number): PoolSnapshot {
  return {
    value: {
      poolAddress: pool.poolAddress,
      token0: {
        chainId: ROBINHOOD_CHAIN_ID,
        address: ROBINHOOD_TOKENS.wrappedNative,
        symbol: 'WETH',
        decimals: 18,
      },
      token1: {
        chainId: ROBINHOOD_CHAIN_ID,
        address: ROBINHOOD_TOKENS.usdg,
        symbol: 'USDG',
        decimals: 6,
      },
      feeTier: 500,
      sqrtPriceX96: 1n << 96n,
      tick,
      tickSpacing: 10,
      activeLiquidity: 1_000_000n,
    },
    block: { chainId: ROBINHOOD_CHAIN_ID, blockNumber, observedAt: new Date(observedAt) },
    quality: 'complete',
    warnings: [],
  }
}

function header(blockNumber: bigint, observedAt: string): BlockHeader {
  return {
    number: blockNumber,
    hash: hash(Number(blockNumber)),
    parentHash: hash(Number(blockNumber - 1n)),
    observedAt: new Date(observedAt),
  }
}

const config = (path: string, overrides: Partial<PositionFeeShareReportConfig> = {}): PositionFeeShareReportConfig => ({
  databasePath: path,
  feeTier: 500,
  tickLower: -100,
  tickUpper: 100,
  positionLiquidity: 100_000n,
  windowSeconds: 3_600,
  limit: 100,
  ...overrides,
})

async function seedEvidence(path: string): Promise<void> {
  const observations = new SqlitePoolObservationStore(path)
  observations.saveSnapshots([
    snapshot(10n, '2026-07-20T10:00:00.000Z', 0),
    snapshot(20n, '2026-07-20T10:30:00.000Z', 20),
  ])
  observations.close()
  const swaps = new SqliteSwapIndexStore(path)
  await swaps.replaceBlock(header(15n, '2026-07-20T10:15:00.000Z'), [
    normalizeSwapLog({
      poolAddress: pool.poolAddress,
      sender: '0x0000000000000000000000000000000000000001',
      recipient: '0x0000000000000000000000000000000000000002',
      amount0: 1_000_000_000_000_000_000n,
      amount1: -1_000_000n,
      sqrtPriceX96: 1n << 96n,
      activeLiquidity: 900_000n,
      tick: 10,
      blockNumber: 15n,
      blockHash: hash(15),
      transactionHash: hash(100),
      logIndex: 1,
    }),
  ])
  await swaps.replaceBlock(header(20n, '2026-07-20T10:30:00.000Z'), [
    normalizeSwapLog({
      poolAddress: pool.poolAddress,
      sender: '0x0000000000000000000000000000000000000001',
      recipient: '0x0000000000000000000000000000000000000002',
      amount0: -1n,
      amount1: 1n,
      sqrtPriceX96: 1n << 96n,
      activeLiquidity: 900_000n,
      tick: 20,
      blockNumber: 20n,
      blockHash: hash(20),
      transactionHash: hash(101),
      logIndex: 0,
    }),
  ])
  swaps.close()
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('position performance report', () => {
  it('returns insufficient evidence without timestamped swaps', () => {
    const path = databasePath()
    const observations = new SqlitePoolObservationStore(path)
    observations.saveSnapshots([
      snapshot(10n, '2026-07-20T10:00:00.000Z', 0),
      snapshot(20n, '2026-07-20T10:30:00.000Z', 20),
    ])
    observations.close()

    const report = buildPositionPerformanceReport(config(path))
    expect(report.status).toBe('insufficient')
    expect(report.scenarios).toEqual([])
    expect(report.warnings.join(' ')).toMatch(/timestamped swap/)
  })

  it('keeps estimates separate and preserves complete realized-fee and cost provenance', async () => {
    const path = databasePath()
    await seedEvidence(path)

    const report = buildPositionPerformanceReport(
      config(path, {
        realizedFees: { amount0: 0n, amount1: 100n, provenance },
        costsSupplied: true,
        costs: [{ category: 'gas', amount0: 0n, amount1: 25n, provenance }],
      }),
    )
    expect(report.status).toBe('complete')
    expect(report.warnings).toEqual([])
    expect(report.totalMatchingSwaps).toBe(2)
    expect(report.scenarios.map((scenario) => scenario.name)).toEqual(['lower', 'endpoint', 'upper'])
    expect(report.realized?.fees1).toBe(100n)
    expect(report.realized?.evidenceQuality).toBe('complete')
    expect(report.realized?.provenance).toEqual(provenance)
    expect(report.realized?.accounting.netVsHodlToken1BaseUnits).toEqual({ numerator: 100n, denominator: 1n })
    expect(report.realized?.costAccounting?.totalCostToken1BaseUnits).toEqual({ numerator: 25n, denominator: 1n })
    expect(report.realized?.costAccounting?.evidenceQuality).toBe('complete')
    expect(report.realized?.costAccounting?.netAfterCostsVsHodlToken1BaseUnits).toEqual({
      numerator: 75n,
      denominator: 1n,
    })
  })

  it('marks amount-only external evidence as partial', async () => {
    const path = databasePath()
    await seedEvidence(path)

    const report = buildPositionPerformanceReport(
      config(path, {
        realizedFees: { amount0: 0n, amount1: 100n },
        costsSupplied: true,
        costs: [{ category: 'gas', amount0: 0n, amount1: 25n }],
      }),
    )

    expect(report.status).toBe('partial')
    expect(report.realized?.evidenceQuality).toBe('partial')
    expect(report.realized?.costAccounting?.evidenceQuality).toBe('partial')
    expect(report.warnings.join(' ')).toMatch(/provenance/)
  })

  it('marks missing cost evidence as partial', async () => {
    const path = databasePath()
    await seedEvidence(path)

    const report = buildPositionPerformanceReport(config(path))
    expect(report.status).toBe('partial')
    expect(report.costsSupplied).toBe(false)
    expect(report.scenarios[0]?.costAccounting).toBeNull()
    expect(report.warnings.join(' ')).toMatch(/cost evidence/)
  })
})
