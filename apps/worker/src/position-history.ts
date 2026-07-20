import {
  analyzePositionHistory,
  estimatePositionFeeShareTimeline,
  formatPositionHistoryAnalysis,
  type PositionFeeShareAnalysis,
  type PositionHistoryDisplay,
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
  display: PositionHistoryDisplay
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
    if (!coverage.latestTimestamp) {
      warnings.push('No timestamped swap evidence is available for the selected pool.')
      return emptyReport(config, pool.poolAddress, null, null, warnings)
    }

    const latest = observationsStore.lastObservationAtOrBefore(pool.poolAddress, coverage.latestTimestamp)
    if (!latest) {
      warnings.push('No pool observations are aligned with timestamped swap evidence.')
      return emptyReport(config, pool.poolAddress, null, null, warnings)
    }

    const from = new Date(latest.block.observedAt.getTime() - config.windowSeconds * 1_000)
    const newestWindowObservations = observationsStore.listObservations(pool.poolAddress, {
      from,
      to: latest.block.observedAt,
      order: 'descending',
      limit: OBSERVATION_LIMIT + 1,
    })
    const truncated = newestWindowObservations.length > OBSERVATION_LIMIT
    const selectedObservations = newestWindowObservations.slice(0, OBSERVATION_LIMIT).reverse()
    if (truncated) warnings.push(`Observation history was truncated to the latest ${OBSERVATION_LIMIT} points.`)
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
    if (swapResult.swaps.length === 0) {
      warnings.push('No swaps exist in the selected replay window; fee scenarios are zero.')
    }

    const timeline = estimatePositionFeeShareTimeline({
      poolAddress: pool.poolAddress,
      feeTier: config.feeTier,
      tickLower: config.tickLower,
      tickUpper: config.tickUpper,
      positionLiquidity: config.positionLiquidity,
      token0Decimals: entry.value.token0.decimals,
      token1Decimals: entry.value.token1.decimals,
      initialTick: entry.value.tick,
      entryBlockNumber: entry.block.blockNumber,
      checkpoints: selectedObservations.map((observation) => ({
        blockNumber: observation.block.blockNumber,
        observedAt: observation.block.observedAt,
      })),
      swaps: swapResult.swaps.map(toFeeShareSwap),
    })
    if (timeline.excludedAtOrBeforeEntrySwapCount > 0) {
      warnings.push(
        `${timeline.excludedAtOrBeforeEntrySwapCount} swap rows at or before the entry block were excluded from fee accrual.`,
      )
    }

    const scenarios = (['lower', 'endpoint', 'upper'] as const).map((name) => {
      const analysis = analyzePositionHistory({
        token0: entry.value.token0,
        token1: entry.value.token1,
        tickLower: config.tickLower,
        tickUpper: config.tickUpper,
        liquidity: config.positionLiquidity,
        observations: cumulativeHistoryObservations(selectedObservations, timeline.checkpoints, name),
      })
      return {
        name,
        analysis,
        display: formatPositionHistoryAnalysis(analysis, entry.value.token0, entry.value.token1),
      }
    })

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
        'This discrete historical replay combines stored pool observations with one-pass bounded fee-share scenarios. It is not realized profit and excludes intra-observation paths, gas, slippage, rebalancing costs, incentives, taxes, and execution risk.',
    }
  } finally {
    observationsStore.close()
    swapsStore.close()
  }
}

function toFeeShareSwap(swap: TimestampedIndexedSwap) {
  return {
    blockNumber: swap.blockNumber,
    transactionHash: swap.transactionHash,
    logIndex: swap.logIndex,
    observedAt: swap.observedAt,
    amount0: swap.amount0,
    amount1: swap.amount1,
    tickAfter: swap.tick,
    activeLiquidityAfter: swap.activeLiquidity,
  }
}

function scenarioFees(
  analysis: PositionFeeShareAnalysis,
  scenario: 'lower' | 'endpoint' | 'upper',
): { amount0: bigint; amount1: bigint } {
  return {
    amount0:
      scenario === 'lower'
        ? analysis.token0.lowerBoundBaseUnits
        : scenario === 'endpoint'
          ? analysis.token0.endpointEstimateBaseUnits
          : analysis.token0.upperBoundBaseUnits,
    amount1:
      scenario === 'lower'
        ? analysis.token1.lowerBoundBaseUnits
        : scenario === 'endpoint'
          ? analysis.token1.endpointEstimateBaseUnits
          : analysis.token1.upperBoundBaseUnits,
  }
}

function cumulativeHistoryObservations(
  observations: readonly PoolSnapshot[],
  checkpoints: readonly { analysis: PositionFeeShareAnalysis }[],
  scenario: 'lower' | 'endpoint' | 'upper',
): PositionHistoryObservationInput[] {
  if (observations.length !== checkpoints.length)
    throw new Error('Fee timeline checkpoint count does not match observations')
  return observations.map((observation, index) => {
    const fees = scenarioFees(checkpoints[index]!.analysis, scenario)
    return {
      blockNumber: observation.block.blockNumber,
      observedAt: observation.block.observedAt,
      sqrtPriceX96: observation.value.sqrtPriceX96,
      tick: observation.value.tick,
      cumulativeFees0: fees.amount0,
      cumulativeFees1: fees.amount1,
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
