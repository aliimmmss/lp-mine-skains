import {
  analyzePositionHistory,
  estimatePositionFeeShare,
  type PositionHistoryAnalysis,
  type PositionHistoryObservationInput,
} from '@lp-mine/core'
import {
  ROBINHOOD_WETH_USDG_POOLS,
  SqlitePoolObservationStore,
  SqliteSwapIndexStore,
  inspectSwapEvidenceCoverage,
  type PoolSnapshot,
  type TimestampedIndexedSwap,
} from '@lp-mine/robinhood-univ3'
import { pathToFileURL } from 'node:url'
import { readPositionFeeShareReportConfig, type PositionFeeShareReportConfig } from './position-fee-share-config.js'

const OBSERVATION_LIMIT = 500

export type PositionHistoryScenario = {
  name: 'lower' | 'endpoint' | 'upper'
  analysis: PositionHistoryAnalysis
}

export type PositionHistoryReport = {
  mode: 'read-only'
  status: 'complete' | 'partial' | 'insufficient'
  databasePath: string
  poolAddress: `0x${string}`
  feeTier: number
  requestedWindowSeconds: number
  observationLimit: number
  entryObservation: PoolSnapshot | null
  exitObservation: PoolSnapshot | null
  totalMatchingSwaps: number
  returnedSwaps: number
  scenarios: readonly PositionHistoryScenario[]
  warnings: readonly string[]
  disclaimer: string
}

export function buildPositionHistoryReport(config: PositionFeeShareReportConfig): PositionHistoryReport {
  const pool = ROBINHOOD_WETH_USDG_POOLS.find((candidate) => candidate.feeTier === config.feeTier)
  if (!pool) throw new Error(`Unsupported canonical fee tier: ${config.feeTier}`)

  const coverage = inspectSwapEvidenceCoverage(config.databasePath, pool.poolAddress)
  const observationsStore = new SqlitePoolObservationStore(config.databasePath)
  const swapsStore = new SqliteSwapIndexStore(config.databasePath)
  try {
    const warnings: string[] = []
    if (coverage.missingTimestampRows > 0) {
      warnings.push(`${coverage.missingTimestampRows} swap rows lack timestamps and are excluded.`)
    }

    const allObservations = observationsStore.listObservations(pool.poolAddress, { limit: 10_000 })
    if (allObservations.length === 10_000) warnings.push('Pool observation query reached its 10000-row limit.')
    if (!coverage.latestTimestamp) {
      warnings.push('No timestamped swap evidence is available for the selected pool.')
      return emptyReport(config, pool.poolAddress, null, null, warnings)
    }

    const eligible = allObservations.filter((observation) => observation.block.observedAt <= coverage.latestTimestamp!)
    const latest = eligible.at(-1) ?? null
    if (!latest) {
      warnings.push('No pool observations are aligned with timestamped swap evidence.')
      return emptyReport(config, pool.poolAddress, null, null, warnings)
    }

    const from = new Date(latest.block.observedAt.getTime() - config.windowSeconds * 1_000)
    const windowObservations = eligible.filter((observation) => observation.block.observedAt >= from)
    const selectedObservations = windowObservations.slice(-OBSERVATION_LIMIT)
    if (windowObservations.length > selectedObservations.length) {
      warnings.push(`Observation history was truncated to the latest ${OBSERVATION_LIMIT} points.`)
    }
    if (selectedObservations.length < 2) {
      warnings.push('At least two aligned pool observations are required.')
      return emptyReport(
        config,
        pool.poolAddress,
        selectedObservations[0] ?? null,
        selectedObservations.at(-1) ?? null,
        warnings,
      )
    }
    if (selectedObservations.some((observation) => observation.quality !== 'complete')) {
      warnings.push('One or more selected observations are partial or stale.')
    }
    for (const observation of selectedObservations) warnings.push(...observation.warnings)

    const entry = selectedObservations[0]!
    const exit = selectedObservations.at(-1)!
    const swapResult = swapsStore.listSwapsByTime(pool.poolAddress, {
      from: entry.block.observedAt,
      to: exit.block.observedAt,
      limit: config.limit,
    })
    if (swapResult.truncated) warnings.push('Swap evidence was truncated by the configured row limit.')
    if (swapResult.swaps.length === 0)
      warnings.push('No swaps exist in the selected replay window; fee scenarios are zero.')

    const scenarios = (['lower', 'endpoint', 'upper'] as const).map((name) => ({
      name,
      analysis: analyzePositionHistory({
        token0: entry.value.token0,
        token1: entry.value.token1,
        tickLower: config.tickLower,
        tickUpper: config.tickUpper,
        liquidity: config.positionLiquidity,
        observations: cumulativeHistoryObservations(
          selectedObservations,
          swapResult.swaps,
          name,
          config,
          pool.poolAddress,
        ),
      }),
    }))

    return {
      mode: 'read-only',
      status: warnings.length === 0 ? 'complete' : 'partial',
      databasePath: config.databasePath,
      poolAddress: pool.poolAddress,
      feeTier: config.feeTier,
      requestedWindowSeconds: config.windowSeconds,
      observationLimit: OBSERVATION_LIMIT,
      entryObservation: entry,
      exitObservation: exit,
      totalMatchingSwaps: swapResult.totalMatching,
      returnedSwaps: swapResult.swaps.length,
      scenarios,
      warnings: [...new Set(warnings)],
      disclaimer:
        'This discrete historical replay combines stored pool observations with bounded fee-share scenarios. It is not realized profit and excludes intra-observation paths, gas, slippage, rebalancing costs, incentives, taxes, and execution risk.',
    }
  } finally {
    observationsStore.close()
    swapsStore.close()
  }
}

function cumulativeHistoryObservations(
  observations: readonly PoolSnapshot[],
  swaps: readonly TimestampedIndexedSwap[],
  scenario: 'lower' | 'endpoint' | 'upper',
  config: PositionFeeShareReportConfig,
  poolAddress: `0x${string}`,
): PositionHistoryObservationInput[] {
  let swapCount = 0
  return observations.map((observation) => {
    while (swapCount < swaps.length && swaps[swapCount]!.observedAt <= observation.block.observedAt) swapCount += 1
    let fees0 = 0n
    let fees1 = 0n
    if (swapCount > 0) {
      const estimate = estimatePositionFeeShare({
        poolAddress,
        feeTier: config.feeTier,
        tickLower: config.tickLower,
        tickUpper: config.tickUpper,
        positionLiquidity: config.positionLiquidity,
        token0Decimals: observation.value.token0.decimals,
        token1Decimals: observation.value.token1.decimals,
        initialTick: observations[0]!.value.tick,
        swaps: swaps.slice(0, swapCount).map((swap) => ({
          blockNumber: swap.blockNumber,
          transactionHash: swap.transactionHash,
          logIndex: swap.logIndex,
          observedAt: swap.observedAt,
          amount0: swap.amount0,
          amount1: swap.amount1,
          tickAfter: swap.tick,
          activeLiquidityAfter: swap.activeLiquidity,
        })),
      })
      const token0 = estimate.token0
      const token1 = estimate.token1
      fees0 =
        scenario === 'lower'
          ? token0.lowerBoundBaseUnits
          : scenario === 'endpoint'
            ? token0.endpointEstimateBaseUnits
            : token0.upperBoundBaseUnits
      fees1 =
        scenario === 'lower'
          ? token1.lowerBoundBaseUnits
          : scenario === 'endpoint'
            ? token1.endpointEstimateBaseUnits
            : token1.upperBoundBaseUnits
    }
    return {
      blockNumber: observation.block.blockNumber,
      observedAt: observation.block.observedAt,
      sqrtPriceX96: observation.value.sqrtPriceX96,
      tick: observation.value.tick,
      cumulativeFees0: fees0,
      cumulativeFees1: fees1,
    }
  })
}

function emptyReport(
  config: PositionFeeShareReportConfig,
  poolAddress: `0x${string}`,
  entryObservation: PoolSnapshot | null,
  exitObservation: PoolSnapshot | null,
  warnings: readonly string[],
): PositionHistoryReport {
  return {
    mode: 'read-only',
    status: 'insufficient',
    databasePath: config.databasePath,
    poolAddress,
    feeTier: config.feeTier,
    requestedWindowSeconds: config.windowSeconds,
    observationLimit: OBSERVATION_LIMIT,
    entryObservation,
    exitObservation,
    totalMatchingSwaps: 0,
    returnedSwaps: 0,
    scenarios: [],
    warnings: [...new Set(warnings)],
    disclaimer: 'Insufficient evidence for historical position replay. No performance conclusion should be drawn.',
  }
}

export function runPositionHistoryCommand(): void {
  const result = buildPositionHistoryReport(readPositionFeeShareReportConfig())
  process.stdout.write(
    `${JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  )
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  try {
    runPositionHistoryCommand()
  } catch (error: unknown) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
