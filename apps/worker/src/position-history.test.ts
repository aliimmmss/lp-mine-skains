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
import { tickToSqrtPriceX96 } from '@lp-mine/core'
import { buildPositionHistoryReport } from './position-history.js'

const directories: string[] = []
const pool = ROBINHOOD_WETH_USDG_POOLS.find((candidate) => candidate.feeTier === 500)!
const hash = (value: number): `0x${string}` => `0x${value.toString(16).padStart(64, '0')}`

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lp-mine-position-history-'))
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
      sqrtPriceX96: tickToSqrtPriceX96(tick),
      tick,
      tickSpacing: 10,
      activeLiquidity: 1_000_000n,
    },
    block: { chainId: ROBINHOOD_CHAIN_ID, blockNumber, observedAt: new Date(observedAt) },
    quality: 'complete',
    warnings: [],
  }
}

function header(number: bigint, observedAt: string): BlockHeader {
  return {
    number,
    hash: hash(Number(number)),
    parentHash: hash(Number(number - 1n)),
    observedAt: new Date(observedAt),
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('position history report', () => {
  it('replays lower, endpoint, and upper fee scenarios', async () => {
    const path = databasePath()
    const observations = new SqlitePoolObservationStore(path)
    observations.saveSnapshots([
      snapshot(10n, '2026-07-20T10:00:00.000Z', 0),
      snapshot(20n, '2026-07-20T10:10:00.000Z', 150),
      snapshot(30n, '2026-07-20T10:30:00.000Z', 50),
    ])
    observations.close()

    const swaps = new SqliteSwapIndexStore(path)
    await swaps.replaceBlock(header(20n, '2026-07-20T10:10:00.000Z'), [
      normalizeSwapLog({
        poolAddress: pool.poolAddress,
        sender: '0x0000000000000000000000000000000000000001',
        recipient: '0x0000000000000000000000000000000000000002',
        amount0: 1_000_000_000_000_000_000n,
        amount1: -1_000_000n,
        sqrtPriceX96: tickToSqrtPriceX96(150),
        activeLiquidity: 900_000n,
        tick: 150,
        blockNumber: 20n,
        blockHash: hash(20),
        transactionHash: hash(100),
        logIndex: 1,
      }),
    ])
    await swaps.replaceBlock(header(30n, '2026-07-20T10:30:00.000Z'), [
      normalizeSwapLog({
        poolAddress: pool.poolAddress,
        sender: '0x0000000000000000000000000000000000000001',
        recipient: '0x0000000000000000000000000000000000000002',
        amount0: -500_000_000_000_000_000n,
        amount1: 600_000n,
        sqrtPriceX96: tickToSqrtPriceX96(50),
        activeLiquidity: 900_000n,
        tick: 50,
        blockNumber: 30n,
        blockHash: hash(30),
        transactionHash: hash(101),
        logIndex: 1,
      }),
    ])
    swaps.close()

    const report = buildPositionHistoryReport({
      databasePath: path,
      feeTier: 500,
      tickLower: -100,
      tickUpper: 100,
      positionLiquidity: 100_000n,
      windowSeconds: 3_600,
      limit: 100,
    })

    expect(report.status).toBe('complete')
    expect(report.scenarios.map((scenario) => scenario.name)).toEqual(['lower', 'endpoint', 'upper'])
    expect(report.scenarios[0]?.analysis.timeInRange).toEqual({ numerator: 1n, denominator: 3n })
    expect(report.scenarios[1]?.analysis.points.at(-1)?.cumulativeFees.amount0).toBeGreaterThanOrEqual(0n)
    expect(report.scenarios[2]?.analysis.points.at(-1)?.cumulativeFees.amount0).toBeGreaterThanOrEqual(
      report.scenarios[1]!.analysis.points.at(-1)!.cumulativeFees.amount0,
    )
  })
})
