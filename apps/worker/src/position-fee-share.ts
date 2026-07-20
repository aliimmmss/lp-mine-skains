import { estimatePositionFeeShare, type PositionFeeShareAnalysis } from '@lp-mine/core'
import { ROBINHOOD_WETH_USDG_POOLS, SqliteSwapIndexStore } from '@lp-mine/robinhood-univ3'
import { pathToFileURL } from 'node:url'
import { readPositionFeeShareReportConfig, type PositionFeeShareReportConfig } from './position-fee-share-config.js'

export type PositionFeeShareReport = {
  mode: 'read-only'
  databasePath: string
  anchoredAt: Date | null
  from: Date | null
  feeTier: number
  poolAddress: `0x${string}` | null
  analysis: PositionFeeShareAnalysis | null
  truncated: boolean
  totalMatching: number
  returned: number
  disclaimer: string
}

export function buildPositionFeeShareReport(config: PositionFeeShareReportConfig): PositionFeeShareReport {
  const pool = ROBINHOOD_WETH_USDG_POOLS.find((candidate) => candidate.feeTier === config.feeTier)
  if (!pool) throw new Error(`Unsupported canonical fee tier: ${config.feeTier}`)

  const store = new SqliteSwapIndexStore(config.databasePath)
  try {
    const anchoredAt = store.latestSwapTime()
    if (!anchoredAt) {
      return {
        mode: 'read-only',
        databasePath: config.databasePath,
        anchoredAt: null,
        from: null,
        feeTier: config.feeTier,
        poolAddress: pool.poolAddress,
        analysis: null,
        truncated: false,
        totalMatching: 0,
        returned: 0,
        disclaimer: 'No timestamped swap evidence is available for position fee-share estimation.',
      }
    }

    const from = new Date(anchoredAt.getTime() - config.windowSeconds * 1_000)
    const result = store.listSwapsByTime(pool.poolAddress, { from, to: anchoredAt, limit: config.limit })
    const analysis =
      result.swaps.length === 0
        ? null
        : estimatePositionFeeShare({
            poolAddress: pool.poolAddress,
            feeTier: config.feeTier,
            tickLower: config.tickLower,
            tickUpper: config.tickUpper,
            positionLiquidity: config.positionLiquidity,
            token0Decimals: 18,
            token1Decimals: 6,
            swaps: result.swaps.map((swap) => ({
              blockNumber: swap.blockNumber,
              observedAt: swap.observedAt,
              amount0: swap.amount0,
              amount1: swap.amount1,
              tickAfter: swap.tick,
              activeLiquidityAfter: swap.activeLiquidity,
            })),
          })

    return {
      mode: 'read-only',
      databasePath: config.databasePath,
      anchoredAt,
      from,
      feeTier: config.feeTier,
      poolAddress: pool.poolAddress,
      analysis,
      truncated: result.truncated,
      totalMatching: result.totalMatching,
      returned: result.swaps.length,
      disclaimer:
        'Position fee-share output is a bounded endpoint-based estimate, not realized fees, APR, LP-vs-HODL return, or profitability.',
    }
  } finally {
    store.close()
  }
}

export function runPositionFeeShareCommand(): void {
  const result = buildPositionFeeShareReport(readPositionFeeShareReportConfig())
  process.stdout.write(
    `${JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  )
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  try {
    runPositionFeeShareCommand()
  } catch (error: unknown) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
