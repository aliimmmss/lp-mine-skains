import { analyzePoolHistory, type PoolHistoryAnalysis } from '@lp-mine/core'
import { ROBINHOOD_WETH_USDG_POOLS, SqlitePoolObservationStore, type PoolSnapshot } from '@lp-mine/robinhood-univ3'
import { pathToFileURL } from 'node:url'
import { readPoolHistoryReportConfig, type PoolHistoryReportConfig } from './pools-history-config.js'

export type PoolHistoryReport = {
  mode: 'read-only'
  databasePath: string
  generatedAt: Date
  analyzedPools: readonly PoolHistoryAnalysis[]
  missingPools: readonly {
    poolAddress: `0x${string}`
    feeTier: number
  }[]
  disclaimer: string
}

function snapshotsToHistoryInput(snapshots: readonly PoolSnapshot[]) {
  const first = snapshots[0]!
  return {
    poolAddress: first.value.poolAddress,
    token0: first.value.token0,
    token1: first.value.token1,
    feeTier: first.value.feeTier,
    observations: snapshots.map((snapshot) => ({
      blockNumber: snapshot.block.blockNumber,
      observedAt: snapshot.block.observedAt,
      sqrtPriceX96: snapshot.value.sqrtPriceX96,
      tick: snapshot.value.tick,
      activeLiquidity: snapshot.value.activeLiquidity,
      quality: snapshot.quality,
      warnings: snapshot.warnings,
    })),
  }
}

export function buildPoolHistoryReport(config: PoolHistoryReportConfig, now = new Date()): PoolHistoryReport {
  const store = new SqlitePoolObservationStore(config.databasePath)
  try {
    const analyzedPools: PoolHistoryAnalysis[] = []
    const missingPools: Array<{ poolAddress: `0x${string}`; feeTier: number }> = []

    for (const pool of ROBINHOOD_WETH_USDG_POOLS) {
      const snapshots = store.listObservations(pool.poolAddress, { limit: config.limit })
      if (snapshots.length === 0) {
        missingPools.push(pool)
        continue
      }
      analyzedPools.push(
        analyzePoolHistory(snapshotsToHistoryInput(snapshots), {
          expectedIntervalSeconds: config.expectedIntervalSeconds,
          minimumCoverageBps: config.minimumCoverageBps,
          now,
        }),
      )
    }

    return {
      mode: 'read-only',
      databasePath: config.databasePath,
      generatedAt: now,
      analyzedPools,
      missingPools,
      disclaimer:
        'Historical price, tick, liquidity, and coverage metrics are descriptive signals, not fee, APR, or profitability estimates.',
    }
  } finally {
    store.close()
  }
}

export function runPoolHistoryCommand(): void {
  const result = buildPoolHistoryReport(readPoolHistoryReportConfig())
  process.stdout.write(
    `${JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  )
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  try {
    runPoolHistoryCommand()
  } catch (error: unknown) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
