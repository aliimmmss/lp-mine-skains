import type { TokenRef } from './index.js'
import { analyzeLpVsHodl, type LpVsHodlAnalysis, type PositionInventory } from './lp-vs-hodl.js'
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

export type PositionHistoryAnalysis = {
  pair: string
  tickLower: number
  tickUpper: number
  liquidity: bigint
  observationCount: number
  firstObservedAt: Date
  lastObservedAt: Date
  elapsedSeconds: bigint
  inRangeSeconds: bigint
  timeInRange: ExactRatio
  rangeEntryCount: number
  rangeExitCount: number
  inventoryTurnover0BaseUnits: bigint
  inventoryTurnover1BaseUnits: bigint
  maximumDrawdownToken1BaseUnits: ExactRatio
  maximumDrawdownRate: ExactRatio
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

  for (const observation of observations) {
    if (Number.isNaN(observation.observedAt.getTime())) throw new RangeError('Observation timestamps must be valid')
    if (observation.sqrtPriceX96 <= 0n) throw new RangeError('sqrtPriceX96 must be positive')
    if (!Number.isInteger(observation.tick)) throw new RangeError('Observation ticks must be integers')
    if ((observation.cumulativeFees0 ?? 0n) < 0n || (observation.cumulativeFees1 ?? 0n) < 0n) {
      throw new RangeError('Cumulative fees must be non-negative')
    }
  }

  const entry = observations[0]!
  const points: PositionHistoryPoint[] = []
  let elapsedSeconds = 0n
  let inRangeSeconds = 0n
  let rangeEntryCount = 0
  let rangeExitCount = 0
  let turnover0 = 0n
  let turnover1 = 0n
  let previousInventory: PositionInventory | null = null
  let previousInRange = isInRange(entry.tick, input.tickLower, input.tickUpper)
  let peakValue: ExactRatio | null = null
  let maximumDrawdown = ratio(0n, 1n)
  let maximumDrawdownRate = ratio(0n, 1n)
  let previousFees0 = 0n
  let previousFees1 = 0n

  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index]!
    const fees0 = observation.cumulativeFees0 ?? 0n
    const fees1 = observation.cumulativeFees1 ?? 0n
    if (fees0 < previousFees0 || fees1 < previousFees1) {
      throw new RangeError('Cumulative fees must not decrease')
    }
    previousFees0 = fees0
    previousFees1 = fees1

    if (index > 0) {
      const previous = observations[index - 1]!
      const milliseconds = observation.observedAt.getTime() - previous.observedAt.getTime()
      if (milliseconds < 0) throw new RangeError('Observations must be chronological')
      const seconds = BigInt(Math.floor(milliseconds / 1_000))
      elapsedSeconds += seconds
      if (previousInRange) inRangeSeconds += seconds
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
    if (!peakValue || compare(value, peakValue) > 0) peakValue = value
    const drawdown = peakValue ? subtract(peakValue, value) : ratio(0n, 1n)
    if (compare(drawdown, maximumDrawdown) > 0) {
      maximumDrawdown = drawdown
      maximumDrawdownRate = peakValue && peakValue.numerator > 0n
        ? ratio(drawdown.numerator * peakValue.denominator, drawdown.denominator * peakValue.numerator)
        : ratio(0n, 1n)
    }

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
    elapsedSeconds,
    inRangeSeconds,
    timeInRange: elapsedSeconds === 0n ? ratio(0n, 1n) : ratio(inRangeSeconds, elapsedSeconds),
    rangeEntryCount,
    rangeExitCount,
    inventoryTurnover0BaseUnits: turnover0,
    inventoryTurnover1BaseUnits: turnover1,
    maximumDrawdownToken1BaseUnits: maximumDrawdown,
    maximumDrawdownRate,
    points,
    assumptions: [
      'Each elapsed interval inherits the range state of its starting observation.',
      'Cumulative fees are supplied externally and must be monotonic.',
      'Inventory turnover measures deterministic token-composition migration, not executed trading volume or rebalance cost.',
      'Maximum drawdown is measured from the running peak of LP value including supplied cumulative fees.',
    ],
    disclaimer:
      'Historical replay uses discrete stored observations and supplied fee evidence. It excludes intra-observation price paths, gas, slippage, rebalancing costs, incentives, taxes, and execution risk.',
  }
}
