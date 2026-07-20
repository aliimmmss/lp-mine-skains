import { formatRatio, type ExactRatio } from './pool-analysis.js'

const FEE_DENOMINATOR = 1_000_000n

export type PositionFeeShareSwapInput = {
  blockNumber: bigint
  observedAt: Date
  amount0: bigint
  amount1: bigint
  tickAfter: number
  activeLiquidityAfter: bigint
}

export type PositionFeeShareInput = {
  poolAddress: `0x${string}`
  feeTier: number
  tickLower: number
  tickUpper: number
  positionLiquidity: bigint
  token0Decimals: number
  token1Decimals: number
  swaps: readonly PositionFeeShareSwapInput[]
}

export type PositionFeeTokenEstimate = {
  nominalPoolFeeBaseUnits: ExactRatio
  lowerBoundBaseUnits: bigint
  endpointEstimateBaseUnits: bigint
  upperBoundBaseUnits: bigint
  lowerBoundDecimal: string
  endpointEstimateDecimal: string
  upperBoundDecimal: string
}

export type PositionFeeShareAnalysis = {
  poolAddress: `0x${string}`
  feeTier: number
  tickLower: number
  tickUpper: number
  positionLiquidity: bigint
  swapCount: number
  knownStartTickSwapCount: number
  unknownStartTickSwapCount: number
  endpointInRangeSwapCount: number
  pathIntersectingSwapCount: number
  token0: PositionFeeTokenEstimate
  token1: PositionFeeTokenEstimate
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

function isInRange(tick: number, lower: number, upper: number): boolean {
  return tick >= lower && tick < upper
}

function pathIntersects(startTick: number | null, endTick: number, lower: number, upper: number): boolean {
  if (startTick === null) return true
  const minimum = Math.min(startTick, endTick)
  const maximum = Math.max(startTick, endTick)
  return maximum >= lower && minimum < upper
}

function nominalFeeBaseUnits(inputAmount: bigint, feeTier: number): ExactRatio {
  return ratio(inputAmount * BigInt(feeTier), FEE_DENOMINATOR)
}

function shareFloor(fee: ExactRatio, positionLiquidity: bigint, activeLiquidityAfter: bigint): bigint {
  const denominator = activeLiquidityAfter + positionLiquidity
  if (denominator === 0n) return 0n
  return (fee.numerator * positionLiquidity) / (fee.denominator * denominator)
}

function decimal(baseUnits: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    throw new RangeError('Token decimals must be an integer between 0 and 30')
  }
  return formatRatio(ratio(baseUnits, 10n ** BigInt(decimals)), decimals)
}

export function estimatePositionFeeShare(input: PositionFeeShareInput): PositionFeeShareAnalysis {
  if (!Number.isInteger(input.feeTier) || input.feeTier < 0 || input.feeTier >= Number(FEE_DENOMINATOR)) {
    throw new RangeError('feeTier must be an integer between 0 and 999999')
  }
  if (!Number.isInteger(input.tickLower) || !Number.isInteger(input.tickUpper) || input.tickLower >= input.tickUpper) {
    throw new RangeError('tickLower must be less than tickUpper')
  }
  if (input.positionLiquidity <= 0n) throw new RangeError('positionLiquidity must be positive')
  if (input.swaps.length === 0) throw new RangeError('At least one swap is required')

  const swaps = [...input.swaps].sort((left, right) => {
    if (left.observedAt.getTime() !== right.observedAt.getTime()) {
      return left.observedAt.getTime() - right.observedAt.getTime()
    }
    return left.blockNumber < right.blockNumber ? -1 : left.blockNumber > right.blockNumber ? 1 : 0
  })

  let previousTick: number | null = null
  let knownStartTickSwapCount = 0
  let unknownStartTickSwapCount = 0
  let endpointInRangeSwapCount = 0
  let pathIntersectingSwapCount = 0
  let token0Input = 0n
  let token1Input = 0n
  let token0EndpointEstimate = 0n
  let token1EndpointEstimate = 0n
  let token0UpperBound = 0n
  let token1UpperBound = 0n

  for (const swap of swaps) {
    if (Number.isNaN(swap.observedAt.getTime())) throw new RangeError('Swap timestamps must be valid')
    if (swap.activeLiquidityAfter < 0n) throw new RangeError('activeLiquidityAfter must be non-negative')
    if (swap.amount0 === 0n && swap.amount1 === 0n) throw new RangeError('Swap token deltas cannot both be zero')

    if (previousTick === null) unknownStartTickSwapCount += 1
    else knownStartTickSwapCount += 1

    const endpointInRange = isInRange(swap.tickAfter, input.tickLower, input.tickUpper)
    const intersects = pathIntersects(previousTick, swap.tickAfter, input.tickLower, input.tickUpper)
    if (endpointInRange) endpointInRangeSwapCount += 1
    if (intersects) pathIntersectingSwapCount += 1

    const input0 = swap.amount0 > 0n ? swap.amount0 : 0n
    const input1 = swap.amount1 > 0n ? swap.amount1 : 0n
    token0Input += input0
    token1Input += input1

    const fee0 = nominalFeeBaseUnits(input0, input.feeTier)
    const fee1 = nominalFeeBaseUnits(input1, input.feeTier)
    if (endpointInRange) {
      token0EndpointEstimate += shareFloor(fee0, input.positionLiquidity, swap.activeLiquidityAfter)
      token1EndpointEstimate += shareFloor(fee1, input.positionLiquidity, swap.activeLiquidityAfter)
    }
    if (intersects) {
      token0UpperBound += fee0.numerator / fee0.denominator
      token1UpperBound += fee1.numerator / fee1.denominator
    }

    previousTick = swap.tickAfter
  }

  const token0Nominal = nominalFeeBaseUnits(token0Input, input.feeTier)
  const token1Nominal = nominalFeeBaseUnits(token1Input, input.feeTier)

  return {
    poolAddress: input.poolAddress,
    feeTier: input.feeTier,
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
    positionLiquidity: input.positionLiquidity,
    swapCount: swaps.length,
    knownStartTickSwapCount,
    unknownStartTickSwapCount,
    endpointInRangeSwapCount,
    pathIntersectingSwapCount,
    token0: {
      nominalPoolFeeBaseUnits: token0Nominal,
      lowerBoundBaseUnits: 0n,
      endpointEstimateBaseUnits: token0EndpointEstimate,
      upperBoundBaseUnits: token0UpperBound,
      lowerBoundDecimal: decimal(0n, input.token0Decimals),
      endpointEstimateDecimal: decimal(token0EndpointEstimate, input.token0Decimals),
      upperBoundDecimal: decimal(token0UpperBound, input.token0Decimals),
    },
    token1: {
      nominalPoolFeeBaseUnits: token1Nominal,
      lowerBoundBaseUnits: 0n,
      endpointEstimateBaseUnits: token1EndpointEstimate,
      upperBoundBaseUnits: token1UpperBound,
      lowerBoundDecimal: decimal(0n, input.token1Decimals),
      endpointEstimateDecimal: decimal(token1EndpointEstimate, input.token1Decimals),
      upperBoundDecimal: decimal(token1UpperBound, input.token1Decimals),
    },
    assumptions: [
      'The endpoint estimate treats each swap as in range only when its post-swap tick is inside the proposed range.',
      'The endpoint estimate uses post-swap active liquidity and assumes the proposed position adds to that liquidity.',
      'The upper bound includes every swap whose known or unknown tick path could intersect the proposed range.',
      'The first swap has an unknown start tick unless predecessor evidence is supplied externally.',
    ],
    disclaimer:
      'This is a bounded fee-share estimate from swap endpoints and active-liquidity snapshots. It is not realized fees, APR, LP-vs-HODL return, or profitability.',
  }
}
