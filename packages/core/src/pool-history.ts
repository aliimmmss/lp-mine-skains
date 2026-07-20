import type { DataQuality, TokenRef } from './index.js'
import { formatRatio, sqrtPriceX96ToToken1PerToken0, type ExactRatio } from './pool-analysis.js'

export type PoolHistoryObservationInput = {
  blockNumber: bigint
  observedAt: Date
  sqrtPriceX96: bigint
  tick: number
  activeLiquidity: bigint
  quality: DataQuality
  warnings: readonly string[]
}

export type PoolHistoryInput = {
  poolAddress: `0x${string}`
  token0: TokenRef
  token1: TokenRef
  feeTier: number
  observations: readonly PoolHistoryObservationInput[]
}

export type PoolHistoryOptions = {
  expectedIntervalSeconds?: number
  minimumCoverageBps?: number
  decimalPlaces?: number
  now?: Date
}

export type PoolHistoryRiskFlag =
  | 'insufficient-observations'
  | 'coverage-gap'
  | 'persistent-zero-liquidity'
  | 'incomplete-history'

export type PoolHistoryAnalysis = {
  poolAddress: `0x${string}`
  pair: string
  feeTier: number
  generatedAt: Date
  observationCount: number
  completeObservationCount: number
  firstBlock: bigint
  lastBlock: bigint
  blockSpan: bigint
  firstObservedAt: Date
  lastObservedAt: Date
  elapsedSeconds: number
  expectedObservationCount: number
  coverage: ExactRatio
  coveragePercent: string
  largestGapSeconds: number
  price: {
    first: ExactRatio
    last: ExactRatio
    minimum: ExactRatio
    maximum: ExactRatio
    firstDecimal: string
    lastDecimal: string
    minimumDecimal: string
    maximumDecimal: string
    relativeChange: ExactRatio
    relativeChangePercent: string
  }
  tick: {
    first: number
    last: number
    minimum: number
    maximum: number
    netChange: number
    span: number
  }
  activeLiquidity: {
    first: bigint
    last: bigint
    minimum: bigint
    maximum: bigint
    nonZeroObservationCount: number
    nonZeroShare: ExactRatio
    nonZeroPercent: string
    relativeChange?: ExactRatio
    relativeChangePercent?: string
  }
  riskFlags: readonly PoolHistoryRiskFlag[]
  warnings: readonly string[]
  disclaimer: string
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left
  let b = right < 0n ? -right : right
  while (b !== 0n) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

function ratio(numerator: bigint, denominator: bigint): ExactRatio {
  if (denominator <= 0n) throw new RangeError('Ratio denominator must be positive')
  if (numerator === 0n) return { numerator: 0n, denominator: 1n }
  const divisor = gcd(numerator, denominator)
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}

function compareRatios(left: ExactRatio, right: ExactRatio): number {
  const cross = left.numerator * right.denominator - right.numerator * left.denominator
  return cross < 0n ? -1 : cross > 0n ? 1 : 0
}

function formatSignedPercent(value: ExactRatio, decimalPlaces = 2): string {
  const sign = value.numerator < 0n ? '-' : ''
  const absolute = ratio(value.numerator < 0n ? -value.numerator : value.numerator, value.denominator)
  return `${sign}${formatRatio(ratio(absolute.numerator * 100n, absolute.denominator), decimalPlaces)}%`
}

export function analyzePoolHistory(input: PoolHistoryInput, options: PoolHistoryOptions = {}): PoolHistoryAnalysis {
  const expectedIntervalSeconds = options.expectedIntervalSeconds ?? 300
  const minimumCoverageBps = options.minimumCoverageBps ?? 8_000
  const decimalPlaces = options.decimalPlaces ?? 8
  if (!Number.isInteger(expectedIntervalSeconds) || expectedIntervalSeconds <= 0) {
    throw new RangeError('expectedIntervalSeconds must be a positive integer')
  }
  if (!Number.isInteger(minimumCoverageBps) || minimumCoverageBps < 0 || minimumCoverageBps > 10_000) {
    throw new RangeError('minimumCoverageBps must be an integer between 0 and 10000')
  }
  if (input.observations.length === 0) throw new RangeError('At least one observation is required')

  const observations = [...input.observations].sort((left, right) => {
    if (left.observedAt.getTime() !== right.observedAt.getTime()) {
      return left.observedAt.getTime() - right.observedAt.getTime()
    }
    return left.blockNumber < right.blockNumber ? -1 : left.blockNumber > right.blockNumber ? 1 : 0
  })
  for (const observation of observations) {
    if (Number.isNaN(observation.observedAt.getTime())) {
      throw new RangeError('Observation timestamps must be valid')
    }
    if (observation.sqrtPriceX96 <= 0n) throw new RangeError('Observation sqrtPriceX96 must be positive')
    if (observation.activeLiquidity < 0n) {
      throw new RangeError('Observation activeLiquidity must be non-negative')
    }
  }

  const first = observations[0]!
  const last = observations[observations.length - 1]!
  const prices = observations.map((observation) =>
    sqrtPriceX96ToToken1PerToken0(observation.sqrtPriceX96, input.token0.decimals, input.token1.decimals),
  )
  let minimumPrice = prices[0]!
  let maximumPrice = prices[0]!
  let largestGapSeconds = 0
  for (let index = 0; index < observations.length; index += 1) {
    const currentPrice = prices[index]!
    if (compareRatios(currentPrice, minimumPrice) < 0) minimumPrice = currentPrice
    if (compareRatios(currentPrice, maximumPrice) > 0) maximumPrice = currentPrice
    if (index > 0) {
      const gap = Math.max(
        0,
        Math.floor((observations[index]!.observedAt.getTime() - observations[index - 1]!.observedAt.getTime()) / 1_000),
      )
      if (gap > largestGapSeconds) largestGapSeconds = gap
    }
  }

  const elapsedSeconds = Math.max(0, Math.floor((last.observedAt.getTime() - first.observedAt.getTime()) / 1_000))
  const expectedObservationCount = elapsedSeconds === 0 ? 1 : Math.floor(elapsedSeconds / expectedIntervalSeconds) + 1
  const coverage = ratio(
    BigInt(Math.min(observations.length, expectedObservationCount)),
    BigInt(expectedObservationCount),
  )
  const completeObservationCount = observations.filter((observation) => observation.quality === 'complete').length
  const nonZeroObservationCount = observations.filter((observation) => observation.activeLiquidity > 0n).length
  const nonZeroShare = ratio(BigInt(nonZeroObservationCount), BigInt(observations.length))
  const ticks = observations.map((observation) => observation.tick)
  const liquidities = observations.map((observation) => observation.activeLiquidity)
  const firstPrice = prices[0]!
  const lastPrice = prices[prices.length - 1]!
  const relativePriceChange = ratio(
    lastPrice.numerator * firstPrice.denominator - firstPrice.numerator * lastPrice.denominator,
    firstPrice.numerator * lastPrice.denominator,
  )
  const riskFlags: PoolHistoryRiskFlag[] = []
  const warnings = observations.flatMap((observation) => observation.warnings)

  if (observations.length < 2) riskFlags.push('insufficient-observations')
  if (coverage.numerator * 10_000n < coverage.denominator * BigInt(minimumCoverageBps)) {
    riskFlags.push('coverage-gap')
  }
  if (nonZeroObservationCount === 0) riskFlags.push('persistent-zero-liquidity')
  if (completeObservationCount !== observations.length) riskFlags.push('incomplete-history')

  const liquidityRelativeChange =
    first.activeLiquidity > 0n ? ratio(last.activeLiquidity - first.activeLiquidity, first.activeLiquidity) : undefined

  return {
    poolAddress: input.poolAddress,
    pair: `${input.token0.symbol}/${input.token1.symbol}`,
    feeTier: input.feeTier,
    generatedAt: options.now ?? new Date(),
    observationCount: observations.length,
    completeObservationCount,
    firstBlock: first.blockNumber,
    lastBlock: last.blockNumber,
    blockSpan: last.blockNumber - first.blockNumber,
    firstObservedAt: first.observedAt,
    lastObservedAt: last.observedAt,
    elapsedSeconds,
    expectedObservationCount,
    coverage,
    coveragePercent: formatSignedPercent(coverage),
    largestGapSeconds,
    price: {
      first: firstPrice,
      last: lastPrice,
      minimum: minimumPrice,
      maximum: maximumPrice,
      firstDecimal: formatRatio(firstPrice, decimalPlaces),
      lastDecimal: formatRatio(lastPrice, decimalPlaces),
      minimumDecimal: formatRatio(minimumPrice, decimalPlaces),
      maximumDecimal: formatRatio(maximumPrice, decimalPlaces),
      relativeChange: relativePriceChange,
      relativeChangePercent: formatSignedPercent(relativePriceChange),
    },
    tick: {
      first: first.tick,
      last: last.tick,
      minimum: Math.min(...ticks),
      maximum: Math.max(...ticks),
      netChange: last.tick - first.tick,
      span: Math.max(...ticks) - Math.min(...ticks),
    },
    activeLiquidity: {
      first: first.activeLiquidity,
      last: last.activeLiquidity,
      minimum: liquidities.reduce((minimum, current) => (current < minimum ? current : minimum)),
      maximum: liquidities.reduce((maximum, current) => (current > maximum ? current : maximum)),
      nonZeroObservationCount,
      nonZeroShare,
      nonZeroPercent: formatSignedPercent(nonZeroShare),
      ...(liquidityRelativeChange
        ? {
            relativeChange: liquidityRelativeChange,
            relativeChangePercent: formatSignedPercent(liquidityRelativeChange),
          }
        : {}),
    },
    riskFlags,
    warnings,
    disclaimer:
      'Historical price, tick, liquidity, and coverage metrics are descriptive signals, not fee, APR, or profitability estimates.',
  }
}
