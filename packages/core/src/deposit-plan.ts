import { percentToTickHalfWidth } from './tick-occupancy.js'

/**
 * Turns a chosen pool and a symmetric range width into the exact, spacing-aligned
 * parameters a human enters into the Uniswap app: tick bounds and the price band
 * they imply. It prepares the numbers only — it never signs, submits, or moves
 * funds. The user reviews and signs in their own wallet.
 */
export type DepositPlanInput = {
  poolAddress: string
  feeTier: number
  tickSpacing: number
  currentTick: number
  token0Symbol: string
  token1Symbol: string
  token0Decimals: number
  token1Decimals: number
}

export type DepositPlan = {
  poolAddress: string
  feeTier: number
  rangePercent: number
  tickLower: number
  tickUpper: number
  currentPriceToken1PerToken0: string
  priceLowerToken1PerToken0: string
  priceUpperToken1PerToken0: string
  pair: string
}

function tickToPrice(tick: number, token0Decimals: number, token1Decimals: number): number {
  // token1 per token0 in display units: 1.0001^tick * 10^(dec0 - dec1)
  return Math.pow(1.0001, tick) * Math.pow(10, token0Decimals - token1Decimals)
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (value >= 1) return value.toFixed(2)
  return value.toPrecision(4)
}

export function buildDepositPlan(input: DepositPlanInput, options: { rangePercent: number }): DepositPlan {
  if (!Number.isInteger(input.tickSpacing) || input.tickSpacing <= 0) {
    throw new RangeError('tickSpacing must be a positive integer')
  }
  if (!(options.rangePercent > 0)) throw new RangeError('rangePercent must be positive')

  const halfWidthTicks = percentToTickHalfWidth(options.rangePercent / 100)
  const spacing = input.tickSpacing
  const tickLower = Math.floor((input.currentTick - halfWidthTicks) / spacing) * spacing
  let tickUpper = Math.ceil((input.currentTick + halfWidthTicks) / spacing) * spacing
  if (tickUpper - tickLower < spacing) tickUpper = tickLower + spacing

  return {
    poolAddress: input.poolAddress,
    feeTier: input.feeTier,
    rangePercent: options.rangePercent,
    tickLower,
    tickUpper,
    currentPriceToken1PerToken0: formatPrice(tickToPrice(input.currentTick, input.token0Decimals, input.token1Decimals)),
    priceLowerToken1PerToken0: formatPrice(tickToPrice(tickLower, input.token0Decimals, input.token1Decimals)),
    priceUpperToken1PerToken0: formatPrice(tickToPrice(tickUpper, input.token0Decimals, input.token1Decimals)),
    pair: `${input.token0Symbol}/${input.token1Symbol}`,
  }
}
