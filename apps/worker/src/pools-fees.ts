import {
  computeFeeYield,
  computeTickOccupancy,
  type ExactRatio,
  type FeeGrowthSample,
  type TickOccupancy,
} from '@lp-mine/core'
import { ROBINHOOD_WETH_USDG_POOLS, SqlitePoolObservationStore, type PoolSnapshot } from '@lp-mine/robinhood-univ3'
import { pathToFileURL } from 'node:url'

const DEFAULT_WINDOW_SECONDS = 86_400
const DEFAULT_REFERENCE_LIQUIDITY = 10n ** 18n
const MINIMUM_MEASURED_WINDOW_SECONDS = 300

export type PoolFeeReportConfig = {
  databasePath: string
  windowSeconds: number
  referenceLiquidity: bigint
  limit: number
}

export type PoolFeeStatus = 'complete' | 'partial' | 'insufficient'

export type PoolFeeEntry = {
  feeTier: number
  poolAddress: `0x${string}`
  pair: string | null
  status: PoolFeeStatus
  windowSeconds: number | null
  sampleCount: number
  earlierObservedAt: string | null
  laterObservedAt: string | null
  currentTick: number | null
  currentActiveLiquidity: string | null
  referenceLiquidity: string
  dailyFeesToken0Decimal: string | null
  dailyFeesToken1Decimal: string | null
  dailyFeesCombinedInToken1Decimal: string | null
  occupancy: TickOccupancy | null
  warnings: readonly string[]
}

export type PoolFeeReport = {
  mode: 'read-only'
  databasePath: string
  generatedAt: Date
  configuredWindowSeconds: number
  referenceLiquidity: string
  pools: readonly PoolFeeEntry[]
  disclaimer: string
}

function toSample(snapshot: PoolSnapshot): FeeGrowthSample | null {
  const { feeGrowthGlobal0X128, feeGrowthGlobal1X128, sqrtPriceX96 } = snapshot.value
  if (feeGrowthGlobal0X128 === undefined || feeGrowthGlobal1X128 === undefined) return null
  return { feeGrowthGlobal0X128, feeGrowthGlobal1X128, sqrtPriceX96, observedAt: snapshot.block.observedAt }
}

function compareRatioDesc(left: ExactRatio | null, right: ExactRatio | null): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  const leftValue = left.numerator * right.denominator
  const rightValue = right.numerator * left.denominator
  if (leftValue === rightValue) return 0
  return leftValue > rightValue ? -1 : 1
}

function analyzePoolFees(
  snapshots: readonly PoolSnapshot[],
  config: PoolFeeReportConfig,
): { entry: Omit<PoolFeeEntry, 'feeTier' | 'poolAddress'>; rank: ExactRatio | null } {
  const withFeeGrowth = snapshots
    .map((snapshot) => ({ snapshot, sample: toSample(snapshot) }))
    .filter((pair): pair is { snapshot: PoolSnapshot; sample: FeeGrowthSample } => pair.sample !== null)
    .sort((left, right) => left.sample.observedAt.getTime() - right.sample.observedAt.getTime())

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1]! : null
  const base = {
    pair: snapshots[0] ? `${snapshots[0].value.token0.symbol}/${snapshots[0].value.token1.symbol}` : null,
    referenceLiquidity: config.referenceLiquidity.toString(),
    currentTick: latest ? latest.value.tick : null,
    currentActiveLiquidity: latest ? latest.value.activeLiquidity.toString() : null,
    occupancy: latest
      ? computeTickOccupancy(
          snapshots.map((snapshot) => snapshot.value.tick),
          latest.value.tick,
        )
      : null,
  }

  const insufficient = (warning: string): { entry: Omit<PoolFeeEntry, 'feeTier' | 'poolAddress'>; rank: null } => ({
    entry: {
      ...base,
      status: 'insufficient',
      windowSeconds: null,
      sampleCount: withFeeGrowth.length,
      earlierObservedAt: null,
      laterObservedAt: null,
      dailyFeesToken0Decimal: null,
      dailyFeesToken1Decimal: null,
      dailyFeesCombinedInToken1Decimal: null,
      warnings: [warning],
    },
    rank: null,
  })

  if (withFeeGrowth.length < 2) {
    return insufficient('Fewer than two observations with fee-growth data are available for this pool.')
  }

  const later = withFeeGrowth[withFeeGrowth.length - 1]!
  const windowStart = later.sample.observedAt.getTime() - config.windowSeconds * 1_000
  const earlier = withFeeGrowth.find((candidate) => candidate.sample.observedAt.getTime() >= windowStart)!
  if (earlier.sample.observedAt.getTime() >= later.sample.observedAt.getTime()) {
    return insufficient('Only one fee-growth observation falls within the configured window.')
  }

  const feeYield = computeFeeYield(earlier.sample, later.sample, {
    referenceLiquidity: config.referenceLiquidity,
  })

  const warnings: string[] = []
  let status: PoolFeeStatus = 'complete'
  if (feeYield.windowSeconds < MINIMUM_MEASURED_WINDOW_SECONDS) {
    status = 'partial'
    warnings.push(
      `Measured window ${feeYield.windowSeconds}s is below ${MINIMUM_MEASURED_WINDOW_SECONDS}s; the daily rate extrapolates a very short sample.`,
    )
  }
  if (later.snapshot.value.activeLiquidity === 0n) {
    status = 'partial'
    warnings.push('Latest observation reports zero active liquidity; realized fees for a new position would be zero.')
  }
  const staleObservations = [earlier.snapshot, later.snapshot].some((snapshot) => snapshot.quality !== 'complete')
  if (staleObservations) {
    status = 'partial'
    warnings.push('One or both observations in the pair are not marked complete.')
  }

  return {
    entry: {
      ...base,
      status,
      windowSeconds: feeYield.windowSeconds,
      sampleCount: withFeeGrowth.length,
      earlierObservedAt: earlier.sample.observedAt.toISOString(),
      laterObservedAt: later.sample.observedAt.toISOString(),
      dailyFeesToken0Decimal: feeYield.dailyFeesToken0Decimal,
      dailyFeesToken1Decimal: feeYield.dailyFeesToken1Decimal,
      dailyFeesCombinedInToken1Decimal: feeYield.dailyFeesCombinedInToken1Decimal,
      warnings,
    },
    rank: feeYield.dailyFeesCombinedInToken1,
  }
}

export function buildPoolFeeReport(config: PoolFeeReportConfig, now = new Date()): PoolFeeReport {
  const store = new SqlitePoolObservationStore(config.databasePath)
  try {
    const ranked = ROBINHOOD_WETH_USDG_POOLS.map((pool) => {
      const snapshots = store.listObservations(pool.poolAddress, { limit: config.limit })
      const { entry, rank } = analyzePoolFees(snapshots, config)
      return { pool, entry, rank }
    }).sort((left, right) => compareRatioDesc(left.rank, right.rank))

    return {
      mode: 'read-only',
      databasePath: config.databasePath,
      generatedAt: now,
      configuredWindowSeconds: config.windowSeconds,
      referenceLiquidity: config.referenceLiquidity.toString(),
      pools: ranked.map(({ pool, entry }) => ({
        feeTier: pool.feeTier,
        poolAddress: pool.poolAddress,
        ...entry,
      })),
      disclaimer:
        'Daily fees are a per-liquidity estimate from past fee-growth deltas, realized only while a position stays in range. They are not a guaranteed APR or a recommendation to deploy capital.',
    }
  } finally {
    store.close()
  }
}

function readConfig(environment: NodeJS.ProcessEnv = process.env): PoolFeeReportConfig {
  const windowSeconds = readPositiveInteger(environment.LP_MINE_FEE_WINDOW_SECONDS, DEFAULT_WINDOW_SECONDS, 'LP_MINE_FEE_WINDOW_SECONDS')
  const referenceLiquidity = readPositiveBigInt(
    environment.LP_MINE_FEE_REFERENCE_LIQUIDITY,
    DEFAULT_REFERENCE_LIQUIDITY,
    'LP_MINE_FEE_REFERENCE_LIQUIDITY',
  )
  const limit = readPositiveInteger(environment.LP_MINE_HISTORY_LIMIT, 10_000, 'LP_MINE_HISTORY_LIMIT')
  return {
    databasePath: environment.LP_MINE_DATABASE_PATH ?? './data/robinhood-univ3.sqlite',
    windowSeconds,
    referenceLiquidity,
    limit,
  }
}

function readPositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an unsigned integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}

function readPositiveBigInt(value: string | undefined, fallback: bigint, name: string): bigint {
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an unsigned integer`)
  const parsed = BigInt(value)
  if (parsed <= 0n) throw new Error(`${name} must be positive`)
  return parsed
}

export function runPoolFeeCommand(): void {
  const result = buildPoolFeeReport(readConfig())
  process.stdout.write(
    `${JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  )
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  try {
    runPoolFeeCommand()
  } catch (error: unknown) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
