import { analyzeSwapEvidence, type SwapEvidenceAnalysis, type TokenRef } from '@lp-mine/core'
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_TOKENS,
  ROBINHOOD_WETH_USDG_POOLS,
  SqliteSwapIndexStore,
} from '@lp-mine/robinhood-univ3'
import { pathToFileURL } from 'node:url'
import { readSwapEvidenceReportConfig, type SwapEvidenceReportConfig } from './swaps-evidence-config.js'

const token0: TokenRef = {
  chainId: ROBINHOOD_CHAIN_ID,
  address: ROBINHOOD_TOKENS.wrappedNative,
  symbol: 'WETH',
  decimals: 18,
}

const token1: TokenRef = {
  chainId: ROBINHOOD_CHAIN_ID,
  address: ROBINHOOD_TOKENS.usdg,
  symbol: 'USDG',
  decimals: 6,
}

export type SwapEvidenceReport = {
  mode: 'read-only'
  databasePath: string
  windowSeconds: number
  anchoredAt: Date | null
  from: Date | null
  pools: readonly SwapEvidenceAnalysis[]
  missingPools: readonly { poolAddress: `0x${string}`; feeTier: number }[]
  truncatedPools: readonly { poolAddress: `0x${string}`; feeTier: number; totalMatching: number; returned: number }[]
  disclaimer: string
}

export function buildSwapEvidenceReport(config: SwapEvidenceReportConfig): SwapEvidenceReport {
  const store = new SqliteSwapIndexStore(config.databasePath)
  try {
    const anchoredAt = store.latestSwapTime()
    if (!anchoredAt) {
      return {
        mode: 'read-only',
        databasePath: config.databasePath,
        windowSeconds: config.windowSeconds,
        anchoredAt: null,
        from: null,
        pools: [],
        missingPools: [...ROBINHOOD_WETH_USDG_POOLS],
        truncatedPools: [],
        disclaimer:
          'No timestamped swap evidence is available. Nominal gross fee evidence is not collectible LP fees, fee share, APR, or profitability.',
      }
    }

    const from = new Date(anchoredAt.getTime() - config.windowSeconds * 1_000)
    const pools: SwapEvidenceAnalysis[] = []
    const missingPools: Array<{ poolAddress: `0x${string}`; feeTier: number }> = []
    const truncatedPools: Array<{
      poolAddress: `0x${string}`
      feeTier: number
      totalMatching: number
      returned: number
    }> = []

    for (const pool of ROBINHOOD_WETH_USDG_POOLS) {
      const result = store.listSwapsByTime(pool.poolAddress, { from, to: anchoredAt, limit: config.limitPerPool })
      if (result.swaps.length === 0) {
        missingPools.push(pool)
        continue
      }
      if (result.truncated) {
        truncatedPools.push({
          poolAddress: pool.poolAddress,
          feeTier: pool.feeTier,
          totalMatching: result.totalMatching,
          returned: result.swaps.length,
        })
      }
      pools.push(
        analyzeSwapEvidence({
          poolAddress: pool.poolAddress,
          token0,
          token1,
          quoteToken: 'token1',
          feeTier: pool.feeTier,
          observations: result.swaps.map((swap) => ({
            blockNumber: swap.blockNumber,
            observedAt: swap.observedAt,
            amount0: swap.amount0,
            amount1: swap.amount1,
          })),
        }),
      )
    }

    return {
      mode: 'read-only',
      databasePath: config.databasePath,
      windowSeconds: config.windowSeconds,
      anchoredAt,
      from,
      pools,
      missingPools,
      truncatedPools,
      disclaimer:
        'Nominal gross fee evidence applies each pool fee rate to observed input flow. It is not collectible LP fees, fee share, APR, divergence-adjusted return, or profitability.',
    }
  } finally {
    store.close()
  }
}

export function runSwapEvidenceCommand(): void {
  const result = buildSwapEvidenceReport(readSwapEvidenceReportConfig())
  process.stdout.write(
    `${JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  )
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  try {
    runSwapEvidenceCommand()
  } catch (error: unknown) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
