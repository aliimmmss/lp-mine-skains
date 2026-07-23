import { formatRatio } from './pool-analysis.js'

const LOG_TICK_BASE = Math.log(1.0001)

/**
 * Approximate Uniswap v3 tick half-width for a symmetric price move of `percent`
 * (e.g. 0.01 for ±1%). tick = log_1.0001(priceRatio), so a +percent move spans
 * ln(1 + percent) / ln(1.0001) ticks.
 */
export function percentToTickHalfWidth(percent: number): number {
  if (!(percent > 0)) throw new RangeError('percent must be positive')
  return Math.round(Math.log(1 + percent) / LOG_TICK_BASE)
}

export type TickOccupancyBand = {
  label: string
  percent: number
  halfWidthTicks: number
  lowerTick: number
  upperTick: number
  observationsInRange: number
  occupancyDecimal: string
}

export type TickOccupancy = {
  currentTick: number
  sampleCount: number
  bands: readonly TickOccupancyBand[]
}

/**
 * Backward-looking occupancy: for each candidate price band centered on the
 * current tick, the fraction of observed ticks that fell inside it. This is a
 * descriptive volatility signal for choosing a range width, not a forecast — it
 * assumes price oscillates around the current level with no persistent trend.
 */
export function computeTickOccupancy(
  ticks: readonly number[],
  currentTick: number,
  percentBands: readonly number[] = [0.01, 0.02, 0.05, 0.1],
): TickOccupancy {
  const sampleCount = ticks.length
  const bands = percentBands.map((percent): TickOccupancyBand => {
    const halfWidthTicks = percentToTickHalfWidth(percent)
    const lowerTick = currentTick - halfWidthTicks
    const upperTick = currentTick + halfWidthTicks
    const observationsInRange = ticks.filter((tick) => tick >= lowerTick && tick <= upperTick).length
    return {
      label: `±${percent * 100}%`,
      percent,
      halfWidthTicks,
      lowerTick,
      upperTick,
      observationsInRange,
      occupancyDecimal: formatRatio(
        { numerator: BigInt(observationsInRange), denominator: BigInt(Math.max(1, sampleCount)) },
        6,
      ),
    }
  })
  return { currentTick, sampleCount, bands }
}
