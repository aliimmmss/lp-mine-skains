import {
  analyzeLpVsHodl,
  applyPositionCosts,
  estimatePositionFeeShare,
  type LpVsHodlAnalysis,
  type PositionCostAccounting,
  type PositionFeeShareAnalysis,
} from '@lp-mine/core'
import {
  ROBINHOOD_WETH_USDG_POOLS,
  SqlitePoolObservationStore,
  SqliteSwapIndexStore,
  inspectSwapEvidenceCoverage,
  type PoolSnapshot,
  type SwapEvidenceCoverage,
} from '@lp-mine/robinhood-univ3'
import { pathToFileURL } from 'node:url'
import { readPositionFeeShareReportConfig, type PositionFeeShareReportConfig } from './position-fee-share-config.js'

export type PositionPerformanceScenario = {
  name: 'lower' | 'endpoint' | 'upper'
  fees0: bigint
  fees1: bigint
  accounting: LpVsHodlAnalysis
  costAccounting: PositionCostAccounting | null
}

export type RealizedPositionPerformance = {
  fees0: bigint
  fees1: bigint
  accounting: LpVsHodlAnalysis
  costAccounting: PositionCostAccounting | null
}

export type PositionPerformanceReport = {
  mode: 'read-only'
  status: 'complete' | 'partial' | 'insufficient'
  databasePath: string
  poolAddress: `0x${string}`
  feeTier: number
  requestedWindowSeconds: number
  coverage: SwapEvidenceCoverage
  entryObservation: PoolSnapshot | null
  exitObservation: PoolSnapshot | null
  swapEvidence: PositionFeeShareAnalysis | null
  scenarios: readonly PositionPerformanceScenario[]
  realized: RealizedPositionPerformance | null
  costsSupplied: boolean
  totalMatchingSwaps: number
  returnedSwaps: number
  warnings: readonly string[]
  disclaimer: string
}

export function buildPositionPerformanceReport(config: PositionFeeShareReportConfig): PositionPerformanceReport {
  const pool = ROBINHOOD_WETH_USDG_POOLS.find((candidate) => candidate.feeTier === config.feeTier)
  if (!pool) throw new Error(`Unsupported canonical fee tier: ${config.feeTier}`)
  const costsSupplied = config.costsSupplied === true
  const costs = config.costs ?? []
  const realizedFees = config.realizedFees ?? null

  const coverage = inspectSwapEvidenceCoverage(config.databasePath, pool.poolAddress)
  const observations = new SqlitePoolObservationStore(config.databasePath)
  const swaps = new SqliteSwapIndexStore(config.databasePath)
  try {
    const allObservations = observations.listObservations(pool.poolAddress, { limit: 10_000 })
    const latestSwapTime = coverage.latestTimestamp
    const eligibleObservations = latestSwapTime
      ? allObservations.filter((observation) => observation.block.observedAt <= latestSwapTime)
      : []
    const exitObservation = eligibleObservations.at(-1) ?? null
    const from = exitObservation
      ? new Date(exitObservation.block.observedAt.getTime() - config.windowSeconds * 1_000)
      : null
    const windowObservations = from
      ? eligibleObservations.filter((observation) => observation.block.observedAt >= from)
      : []
    const entryObservation = windowObservations[0] ?? null
    const warnings: string[] = []

    if (!latestSwapTime) warnings.push('No timestamped swap evidence is available.')
    if (coverage.missingTimestampRows > 0) {
      warnings.push(`${coverage.missingTimestampRows} swap rows lack block timestamps and are excluded.`)
    }
    if (allObservations.length === 10_000) warnings.push('Pool observation query reached its 10000-row limit.')
    if (windowObservations.some((observation) => observation.quality !== 'complete')) {
      warnings.push('One or more selected pool observations are partial or stale.')
    }
    for (const observation of windowObservations) warnings.push(...observation.warnings)
    if (!costsSupplied) warnings.push('No explicit gas, slippage, rebalance, or other cost evidence was supplied.')

    if (!entryObservation || !exitObservation || entryObservation === exitObservation) {
      return emptyReport(config, pool.poolAddress, coverage, entryObservation, exitObservation, warnings)
    }

    const result = swaps.listSwapsByTime(pool.poolAddress, {
      from: entryObservation.block.observedAt,
      to: exitObservation.block.observedAt,
      limit: config.limit,
    })
    if (result.truncated) warnings.push('Swap evidence was truncated by the configured row limit.')
    if (result.swaps.length === 0) {
      warnings.push('No swaps exist between the selected entry and exit observations.')
      return emptyReport(config, pool.poolAddress, coverage, entryObservation, exitObservation, warnings)
    }

    const swapEvidence = estimatePositionFeeShare({
      poolAddress: pool.poolAddress,
      feeTier: config.feeTier,
      tickLower: config.tickLower,
      tickUpper: config.tickUpper,
      positionLiquidity: config.positionLiquidity,
      token0Decimals: entryObservation.value.token0.decimals,
      token1Decimals: entryObservation.value.token1.decimals,
      initialTick: entryObservation.value.tick,
      swaps: result.swaps.map((swap) => ({
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

    const analyze = (fees0: bigint, fees1: bigint) =>
      analyzeLpVsHodl({
        token0: entryObservation.value.token0,
        token1: entryObservation.value.token1,
        tickLower: config.tickLower,
        tickUpper: config.tickUpper,
        liquidity: config.positionLiquidity,
        entrySqrtPriceX96: entryObservation.value.sqrtPriceX96,
        exitSqrtPriceX96: exitObservation.value.sqrtPriceX96,
        fees0,
        fees1,
      })
    const withCosts = (accounting: LpVsHodlAnalysis) =>
      costsSupplied ? applyPositionCosts({ accounting, costs }) : null

    const scenarioFees = [
      {
        name: 'lower' as const,
        fees0: swapEvidence.token0.lowerBoundBaseUnits,
        fees1: swapEvidence.token1.lowerBoundBaseUnits,
      },
      {
        name: 'endpoint' as const,
        fees0: swapEvidence.token0.endpointEstimateBaseUnits,
        fees1: swapEvidence.token1.endpointEstimateBaseUnits,
      },
      {
        name: 'upper' as const,
        fees0: swapEvidence.token0.upperBoundBaseUnits,
        fees1: swapEvidence.token1.upperBoundBaseUnits,
      },
    ]
    const scenarios = scenarioFees.map((scenario) => {
      const accounting = analyze(scenario.fees0, scenario.fees1)
      return { ...scenario, accounting, costAccounting: withCosts(accounting) }
    })
    const realized = realizedFees
      ? (() => {
          const accounting = analyze(realizedFees.amount0, realizedFees.amount1)
          return {
            fees0: realizedFees.amount0,
            fees1: realizedFees.amount1,
            accounting,
            costAccounting: withCosts(accounting),
          }
        })()
      : null

    return {
      mode: 'read-only',
      status: warnings.length === 0 ? 'complete' : 'partial',
      databasePath: config.databasePath,
      poolAddress: pool.poolAddress,
      feeTier: config.feeTier,
      requestedWindowSeconds: config.windowSeconds,
      coverage,
      entryObservation,
      exitObservation,
      swapEvidence,
      scenarios,
      realized,
      costsSupplied,
      totalMatchingSwaps: result.totalMatching,
      returnedSwaps: result.swaps.length,
      warnings: [...new Set(warnings)],
      disclaimer:
        'Estimated fee scenarios remain separate from externally supplied realized fees. Cost-adjusted values appear only when explicit cost evidence is supplied. This report does not infer APR, taxes, incentives, or execution quality.',
    }
  } finally {
    observations.close()
    swaps.close()
  }
}

function emptyReport(
  config: PositionFeeShareReportConfig,
  poolAddress: `0x${string}`,
  coverage: SwapEvidenceCoverage,
  entryObservation: PoolSnapshot | null,
  exitObservation: PoolSnapshot | null,
  warnings: readonly string[],
): PositionPerformanceReport {
  return {
    mode: 'read-only',
    status: 'insufficient',
    databasePath: config.databasePath,
    poolAddress,
    feeTier: config.feeTier,
    requestedWindowSeconds: config.windowSeconds,
    coverage,
    entryObservation,
    exitObservation,
    swapEvidence: null,
    scenarios: [],
    realized: null,
    costsSupplied: config.costsSupplied === true,
    totalMatchingSwaps: 0,
    returnedSwaps: 0,
    warnings: [...new Set(warnings.length > 0 ? warnings : ['At least two pool observations are required.'])],
    disclaimer: 'Insufficient evidence for LP-versus-HODL performance. No profitability conclusion should be drawn.',
  }
}

export function runPositionPerformanceCommand(): void {
  const result = buildPositionPerformanceReport(readPositionFeeShareReportConfig())
  process.stdout.write(
    `${JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  )
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  try {
    runPositionPerformanceCommand()
  } catch (error: unknown) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
