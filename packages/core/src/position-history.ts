import type { TokenRef } from './index.js'
import {
  analyzeLpVsHodl,
  MAX_UNISWAP_V3_SQRT_RATIO_X96,
  MAX_UNISWAP_V3_TICK,
  MIN_UNISWAP_V3_SQRT_RATIO_X96,
  MIN_UNISWAP_V3_TICK,
  tickToSqrtPriceX96,
  type LpVsHodlAnalysis,
  type PositionInventory,
} from './lp-vs-hodl.js'
import type { ExactRatio } from './pool-analysis.js'

export type PositionHistoryObservationInput = {
  blockNumber: bigint
  observedAt: Date
  sqrtPriceX96: bigint
  tick: number
  cumulativeFees0?: bigint
  cumulativeFees1?: bigint
}

export type PositionHistoryInput = {
  token0: TokenRef
  token1: TokenRef
  tickLower: number
  tickUpper: number
  liquidity: bigint
  observations: readonly PositionHistoryObservationInput[]
}

export type PositionHistoryPoint = {
  blockNumber: bigint
  observedAt: Date
  tick: number
  inRange: boolean
  cumulativeFees: PositionInventory
  accounting: LpVsHodlAnalysis
}

export type PositionDrawdownEvidence = {
  amountToken1BaseUnits: ExactRatio
  rate: ExactRatio
  peakBlockNumber: bigint
  peakObservedAt: Date
  troughBlockNumber: bigint
  troughObservedAt: Date
}

export type PositionHistoryAnalysis = {
  pair: string
  tickLower: number
  tickUpper: number
  liquidity: bigint
  observationCount: number
  firstObservedAt: Date
  lastObservedAt: Date
  elapsedMilliseconds: bigint
  inRangeMilliseconds: bigint
  elapsedSeconds: bigint
  inRangeSeconds: bigint
  timeInRange: ExactRatio
  rangeEntryCount: number
  rangeExitCount: number
  inventoryTurnover0BaseUnits: bigint
  inventoryTurnover1BaseUnits: bigint
  maximumDrawdownToken1BaseUnits: ExactRatio
  maximumDrawdownRate: ExactRatio
  maximumAbsoluteDrawdown: PositionDrawdownEvidence
  maximumPercentageDrawdown: PositionDrawdownEvidence
  points: readonly PositionHistoryPoint[]
  assumptions: readonly string[]
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

function subtract(left: ExactRatio, right: ExactRatio): ExactRatio {
  return ratio(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  )
}

function compare(left: ExactRatio, right: ExactRatio): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator
  return difference < 0n ? -1 : difference > 0n ? 1 : 0
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value
}

function isInRange(tick: number, lower: number, upper: number): boolean {
  return tick >= lower && tick < upper
}

function drawdownRate(drawdown: ExactRatio, peak: ExactRatio): ExactRatio {
  return peak.numerator > 0n
    ? ratio(drawdown.numerator * peak.denominator, drawdown.denominator * peak.numerator)
    : ratio(0n, 1n)
}

function validateTickAndSqrtPrice(observation: PositionHistoryObservationInput): void {
  if (
    !Number.isInteger(observation.tick) ||
    observation.tick < MIN_UNISWAP_V3_TICK ||
    observation.tick >= MAX_UNISWAP_V3_TICK
  ) {
    throw new RangeError('Observation ticks must be executable Uniswap v3 ticks')
  }
  if (
    observation.sqrtPriceX96 < MIN_UNISWAP_V3_SQRT_RATIO_X96 ||
    observation.sqrtPriceX96 >= MAX_UNISWAP_V3_SQRT_RATIO_X96
  ) {
    throw new RangeError('Observation sqrtPriceX96 is outside executable Uniswap v3 bounds')
  }
  const lower = tickToSqrtPriceX96(observation.tick)
  const upper = tickToSqrtPriceX96(observation.tick + 1)
  if (observation.sqrtPriceX96 < lower || observation.sqrtPriceX96 >= upper) {
    throw new RangeError('Observation tick is inconsistent with sqrtPriceX96')
  }
}

function emptyDrawdown(observation: PositionHistoryObservationInput): PositionDrawdownEvidence {
  return {
    amountToken1BaseUnits: ratio(0n, 1n),
    rate: ratio(0n, 1n),
    peakBlockNumber: observation.blockNumber,
    peakObservedAt: observation.observedAt,
    troughBlockNumber: observation.blockNumber,
    troughObservedAt: observation.observedAt,
  }
}

export function analyzePositionHistory(input: PositionHistoryInput): PositionHistoryAnalysis {
  if (!Number.isInteger(input.tickLower) || !Number.isInteger(input.tickUpper) || input.tickLower >= input.tickUpper) {
    throw new RangeError('tickLower must be less than tickUpper')
  }
  if (input.liquidity <= 0n) throw new RangeError('liquidity must be positive')
  if (input.observations.length < 2) throw new RangeError('At least two observations are required')

  const observations = [...input.observations].sort((left, right) => {
    if (left.observedAt.getTime() !== right.observedAt.getTime()) {
      return left.observedAt.getTime() - right.observedAt.getTime()
    }
    return left.blockNumber < right.blockNumber ? -1 : left.blockNumber > right.blockNumber ? 1 : 0
  })

  const blockNumbers = new Set<string>()
  const timestamps = new Set<number>()
  for (const observation of observations) {
    const timestamp = observation.observedAt.getTime()
    if (Number.isNaN(timestamp)) throw new RangeError('Observation timestamps must be valid')
    if (blockNumbers.has(observation.blockNumber.toString()))
      throw new RangeError('Observation block numbers must be unique')
    if (timestamps.has(timestamp)) throw new RangeError('Observation timestamps must be unique')
    blockNumbers.add(observation.blockNumber.toString())
    timestamps.add(timestamp)
    validateTickAndSqrtPrice(observation)
    if ((observation.cumulativeFees0 ?? 0n) < 0n || (observation.cumulativeFees1 ?? 0n) < 0n) {
      throw new RangeError('Cumulative fees must be non-negative')
    }
  }
  for (let index = 1; index < observations.length; index += 1) {
    if (observations[index]!.blockNumber <= observations[index - 1]!.blockNumber) {
      throw new RangeError('Observation block numbers must increase chronologically')
    }
  }

  const entry = observations[0]!
  const points: PositionHistoryPoint[] = []
  let elapsedMilliseconds = 0n
  let inRangeMilliseconds = 0n
  let rangeEntryCount = 0
  let rangeExitCount = 0
  let turnover0 = 0n
  let turnover1 = 0n
  let previousInventory: PositionInventory | null = null
  let previousInRange = isInRange(entry.tick, input.tickLower, input.tickUpper)
  let peakValue: ExactRatio | null = null
  let peakObservation = entry
  let maximumAbsoluteDrawdown = emptyDrawdown(entry)
  let maximumPercentageDrawdown = emptyDrawdown(entry)
  let previousFees0 = 0n
  let previousFees1 = 0n

  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index]!
    const fees0 = observation.cumulativeFees0 ?? 0n
    const fees1 = observation.cumulativeFees1 ?? 0n
    if (fees0 < previousFees0 || fees1 < previousFees1) throw new RangeError('Cumulative fees must not decrease')
    previousFees0 = fees0
    previousFees1 = fees1

    if (index > 0) {
      const previous = observations[index - 1]!
      const milliseconds = BigInt(observation.observedAt.getTime() - previous.observedAt.getTime())
      elapsedMilliseconds += milliseconds
      if (previousInRange) inRangeMilliseconds += milliseconds
    }

    const inRange = isInRange(observation.tick, input.tickLower, input.tickUpper)
    if (index > 0 && !previousInRange && inRange) rangeEntryCount += 1
    if (index > 0 && previousInRange && !inRange) rangeExitCount += 1

    const accounting = analyzeLpVsHodl({
      token0: input.token0,
      token1: input.token1,
      tickLower: input.tickLower,
      tickUpper: input.tickUpper,
      liquidity: input.liquidity,
      entrySqrtPriceX96: entry.sqrtPriceX96,
      exitSqrtPriceX96: observation.sqrtPriceX96,
      fees0,
      fees1,
    })

    if (previousInventory) {
      turnover0 += absolute(accounting.exitInventory.amount0 - previousInventory.amount0)
      turnover1 += absolute(accounting.exitInventory.amount1 - previousInventory.amount1)
    }
    previousInventory = accounting.exitInventory

    const value = accounting.lpValueWithFeesToken1BaseUnits
    if (!peakValue || compare(value, peakValue) > 0) {
      peakValue = value
      peakObservation = observation
    }
    const drawdown = peakValue ? subtract(peakValue, value) : ratio(0n, 1n)
    const rate = peakValue ? drawdownRate(drawdown, peakValue) : ratio(0n, 1n)
    const evidence: PositionDrawdownEvidence = {
      amountToken1BaseUnits: drawdown,
      rate,
      peakBlockNumber: peakObservation.blockNumber,
      peakObservedAt: peakObservation.observedAt,
      troughBlockNumber: observation.blockNumber,
      troughObservedAt: observation.observedAt,
    }
    if (compare(drawdown, maximumAbsoluteDrawdown.amountToken1BaseUnits) > 0) maximumAbsoluteDrawdown = evidence
    if (compare(rate, maximumPercentageDrawdown.rate) > 0) maximumPercentageDrawdown = evidence

    points.push({
      blockNumber: observation.blockNumber,
      observedAt: observation.observedAt,
      tick: observation.tick,
      inRange,
      cumulativeFees: { amount0: fees0, amount1: fees1 },
      accounting,
    })
    previousInRange = inRange
  }

  return {
    pair: `${input.token0.symbol}/${input.token1.symbol}`,
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
    liquidity: input.liquidity,
    observationCount: observations.length,
    firstObservedAt: entry.observedAt,
    lastObservedAt: observations.at(-1)!.observedAt,
    elapsedMilliseconds,
    inRangeMilliseconds,
    elapsedSeconds: elapsedMilliseconds / 1_000n,
    inRangeSeconds: inRangeMilliseconds / 1_000n,
    timeInRange: elapsedMilliseconds === 0n ? ratio(0n, 1n) : ratio(inRangeMilliseconds, elapsedMilliseconds),
    rangeEntryCount,
    rangeExitCount,
    inventoryTurnover0BaseUnits: turnover0,
    inventoryTurnover1BaseUnits: turnover1,
    maximumDrawdownToken1BaseUnits: maximumAbsoluteDrawdown.amountToken1BaseUnits,
    maximumDrawdownRate: maximumPercentageDrawdown.rate,
    maximumAbsoluteDrawdown,
    maximumPercentageDrawdown,
    points,
    assumptions: [
      'Each elapsed interval inherits the range state of its starting observation.',
      'Duration and time-in-range are accumulated in exact milliseconds; whole-second fields are derived afterward.',
      'Cumulative fees are supplied externally and must be monotonic.',
      'Inventory turnover measures deterministic token-composition migration, not executed trading volume or rebalance cost.',
      'Maximum absolute and percentage drawdowns are tracked independently from the running peak of LP value including supplied cumulative fees.',
    ],
    disclaimer:
      'Historical replay uses discrete stored observations and supplied fee evidence. It excludes intra-observation price paths, gas, slippage, rebalancing costs, incentives, taxes, and execution risk.',
  }
}
