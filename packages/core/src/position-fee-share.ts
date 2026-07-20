import { formatRatio, type ExactRatio } from './pool-analysis.js'
import { classifyCanonicalSwap } from './swap-shape.js'

const FEE_DENOMINATOR = 1_000_000n

export type PositionFeeShareSwapInput = {
  blockNumber: bigint
  transactionHash: `0x${string}`
  logIndex: number
  observedAt: Date
  amount0: bigint
  amount1: bigint
  tickAfter: number
  activeLiquidityAfter: bigint
}

export type PositionFeeShareParameters = {
  poolAddress: `0x${string}`
  feeTier: number
  tickLower: number
  tickUpper: number
  positionLiquidity: bigint
  token0Decimals: number
  token1Decimals: number
  initialTick?: number
}

export type PositionFeeShareInput = PositionFeeShareParameters & {
  swaps: readonly PositionFeeShareSwapInput[]
}

export type PositionFeeShareCheckpointInput = {
  blockNumber: bigint
  observedAt: Date
}

export type PositionFeeShareTimelineInput = PositionFeeShareParameters & {
  entryBlockNumber: bigint
  checkpoints: readonly PositionFeeShareCheckpointInput[]
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

export type PositionFeeShareAnalysis = PositionFeeShareParameters & {
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

export type PositionFeeShareTimelinePoint = {
  blockNumber: bigint
  observedAt: Date
  analysis: PositionFeeShareAnalysis
}

export type PositionFeeShareTimeline = {
  entryBlockNumber: bigint
  processedSwapCount: number
  excludedAtOrBeforeEntrySwapCount: number
  checkpoints: readonly PositionFeeShareTimelinePoint[]
  assumptions: readonly string[]
}

type Accumulator = {
  previousTick: number | null
  swapCount: number
  knownStartTickSwapCount: number
  unknownStartTickSwapCount: number
  endpointInRangeSwapCount: number
  pathIntersectingSwapCount: number
  token0Input: bigint
  token1Input: bigint
  token0IntersectingInput: bigint
  token1IntersectingInput: bigint
  token0EndpointEstimate: bigint
  token1EndpointEstimate: bigint
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

function compareObservedOrder(
  left: { observedAt: Date; blockNumber: bigint; logIndex?: number },
  right: { observedAt: Date; blockNumber: bigint; logIndex?: number },
): number {
  const timeDifference = left.observedAt.getTime() - right.observedAt.getTime()
  if (timeDifference !== 0) return timeDifference
  return compareBlockOrder(left, right)
}

function compareBlockOrder(
  left: { blockNumber: bigint; logIndex?: number },
  right: { blockNumber: bigint; logIndex?: number },
): number {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber < right.blockNumber ? -1 : 1
  return (left.logIndex ?? -1) - (right.logIndex ?? -1)
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

function feeCeiling(inputAmount: bigint, feeTier: number): bigint {
  const numerator = inputAmount * BigInt(feeTier)
  const floor = numerator / FEE_DENOMINATOR
  return floor + (numerator % FEE_DENOMINATOR === 0n ? 0n : 1n)
}

function decimal(baseUnits: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    throw new RangeError('Token decimals must be an integer between 0 and 30')
  }
  return formatRatio(ratio(baseUnits, 10n ** BigInt(decimals)), decimals)
}

function validateParameters(input: PositionFeeShareParameters): void {
  if (!Number.isInteger(input.feeTier) || input.feeTier < 0 || input.feeTier >= Number(FEE_DENOMINATOR)) {
    throw new RangeError('feeTier must be an integer between 0 and 999999')
  }
  if (!Number.isInteger(input.tickLower) || !Number.isInteger(input.tickUpper) || input.tickLower >= input.tickUpper) {
    throw new RangeError('tickLower must be less than tickUpper')
  }
  if (input.initialTick !== undefined && !Number.isInteger(input.initialTick)) {
    throw new RangeError('initialTick must be an integer')
  }
  if (input.positionLiquidity <= 0n) throw new RangeError('positionLiquidity must be positive')
  decimal(0n, input.token0Decimals)
  decimal(0n, input.token1Decimals)
}

function validateSwap(swap: PositionFeeShareSwapInput): void {
  if (Number.isNaN(swap.observedAt.getTime())) throw new RangeError('Swap timestamps must be valid')
  if (!Number.isInteger(swap.logIndex) || swap.logIndex < 0) {
    throw new RangeError('Swap logIndex must be a non-negative integer')
  }
  if (!Number.isInteger(swap.tickAfter)) throw new RangeError('Swap tickAfter must be an integer')
  if (swap.activeLiquidityAfter < 0n) throw new RangeError('activeLiquidityAfter must be non-negative')
  classifyCanonicalSwap(swap.amount0, swap.amount1)
}

function createAccumulator(initialTick: number | undefined): Accumulator {
  return {
    previousTick: initialTick ?? null,
    swapCount: 0,
    knownStartTickSwapCount: 0,
    unknownStartTickSwapCount: 0,
    endpointInRangeSwapCount: 0,
    pathIntersectingSwapCount: 0,
    token0Input: 0n,
    token1Input: 0n,
    token0IntersectingInput: 0n,
    token1IntersectingInput: 0n,
    token0EndpointEstimate: 0n,
    token1EndpointEstimate: 0n,
  }
}

function accumulate(state: Accumulator, swap: PositionFeeShareSwapInput, input: PositionFeeShareParameters): void {
  const direction = classifyCanonicalSwap(swap.amount0, swap.amount1)
  if (state.previousTick === null) state.unknownStartTickSwapCount += 1
  else state.knownStartTickSwapCount += 1

  const endpointInRange = isInRange(swap.tickAfter, input.tickLower, input.tickUpper)
  const intersects = pathIntersects(state.previousTick, swap.tickAfter, input.tickLower, input.tickUpper)
  if (endpointInRange) state.endpointInRangeSwapCount += 1
  if (intersects) state.pathIntersectingSwapCount += 1

  const input0 = direction === 'token0-input' ? swap.amount0 : 0n
  const input1 = direction === 'token1-input' ? swap.amount1 : 0n
  state.token0Input += input0
  state.token1Input += input1

  if (endpointInRange) {
    state.token0EndpointEstimate += shareFloor(
      nominalFeeBaseUnits(input0, input.feeTier),
      input.positionLiquidity,
      swap.activeLiquidityAfter,
    )
    state.token1EndpointEstimate += shareFloor(
      nominalFeeBaseUnits(input1, input.feeTier),
      input.positionLiquidity,
      swap.activeLiquidityAfter,
    )
  }
  if (intersects) {
    state.token0IntersectingInput += input0
    state.token1IntersectingInput += input1
  }

  state.previousTick = swap.tickAfter
  state.swapCount += 1
}

function analysisFromAccumulator(input: PositionFeeShareParameters, state: Accumulator): PositionFeeShareAnalysis {
  const token0UpperBound = feeCeiling(state.token0IntersectingInput, input.feeTier)
  const token1UpperBound = feeCeiling(state.token1IntersectingInput, input.feeTier)
  return {
    poolAddress: input.poolAddress,
    feeTier: input.feeTier,
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
    positionLiquidity: input.positionLiquidity,
    token0Decimals: input.token0Decimals,
    token1Decimals: input.token1Decimals,
    ...(input.initialTick === undefined ? {} : { initialTick: input.initialTick }),
    swapCount: state.swapCount,
    knownStartTickSwapCount: state.knownStartTickSwapCount,
    unknownStartTickSwapCount: state.unknownStartTickSwapCount,
    endpointInRangeSwapCount: state.endpointInRangeSwapCount,
    pathIntersectingSwapCount: state.pathIntersectingSwapCount,
    token0: {
      nominalPoolFeeBaseUnits: nominalFeeBaseUnits(state.token0Input, input.feeTier),
      lowerBoundBaseUnits: 0n,
      endpointEstimateBaseUnits: state.token0EndpointEstimate,
      upperBoundBaseUnits: token0UpperBound,
      lowerBoundDecimal: decimal(0n, input.token0Decimals),
      endpointEstimateDecimal: decimal(state.token0EndpointEstimate, input.token0Decimals),
      upperBoundDecimal: decimal(token0UpperBound, input.token0Decimals),
    },
    token1: {
      nominalPoolFeeBaseUnits: nominalFeeBaseUnits(state.token1Input, input.feeTier),
      lowerBoundBaseUnits: 0n,
      endpointEstimateBaseUnits: state.token1EndpointEstimate,
      upperBoundBaseUnits: token1UpperBound,
      lowerBoundDecimal: decimal(0n, input.token1Decimals),
      endpointEstimateDecimal: decimal(state.token1EndpointEstimate, input.token1Decimals),
      upperBoundDecimal: decimal(token1UpperBound, input.token1Decimals),
    },
    assumptions: [
      'The endpoint estimate treats each swap as in range only when its post-swap tick is inside the proposed range.',
      'The endpoint estimate uses post-swap active liquidity and assumes the proposed position adds to that liquidity.',
      'The upper bound applies one aggregate fee ceiling to all validated input flow whose tick path could intersect the range.',
      input.initialTick === undefined
        ? 'The first swap has an unknown start tick because predecessor evidence was not supplied.'
        : 'The supplied initial tick is used as predecessor evidence for the first swap.',
    ],
    disclaimer:
      'This is a bounded fee-share estimate from validated swap endpoints and active-liquidity snapshots. It is not realized fees, APR, LP-vs-HODL return, or profitability.',
  }
}

export function estimatePositionFeeShare(input: PositionFeeShareInput): PositionFeeShareAnalysis {
  validateParameters(input)
  if (input.swaps.length === 0) throw new RangeError('At least one swap is required')
  const swaps = [...input.swaps].sort(compareObservedOrder)
  const state = createAccumulator(input.initialTick)
  for (const swap of swaps) {
    validateSwap(swap)
    accumulate(state, swap, input)
  }
  return analysisFromAccumulator(input, state)
}

export function estimatePositionFeeShareTimeline(input: PositionFeeShareTimelineInput): PositionFeeShareTimeline {
  validateParameters(input)
  if (input.entryBlockNumber < 0n) throw new RangeError('entryBlockNumber must be non-negative')
  if (input.checkpoints.length === 0) throw new RangeError('At least one checkpoint is required')

  const checkpoints = [...input.checkpoints].sort(compareBlockOrder)
  for (let index = 0; index < checkpoints.length; index += 1) {
    const checkpoint = checkpoints[index]!
    if (Number.isNaN(checkpoint.observedAt.getTime())) throw new RangeError('Checkpoint timestamps must be valid')
    if (checkpoint.blockNumber < input.entryBlockNumber) {
      throw new RangeError('Checkpoint blocks must not precede the entry block')
    }
    if (index > 0 && checkpoint.blockNumber <= checkpoints[index - 1]!.blockNumber) {
      throw new RangeError('Checkpoint blocks must increase strictly')
    }
  }

  const swaps = [...input.swaps].sort(compareBlockOrder)
  for (const swap of swaps) validateSwap(swap)
  const included = swaps.filter((swap) => swap.blockNumber > input.entryBlockNumber)
  const excludedAtOrBeforeEntrySwapCount = swaps.length - included.length
  const state = createAccumulator(input.initialTick)
  const points: PositionFeeShareTimelinePoint[] = []
  let swapIndex = 0

  for (const checkpoint of checkpoints) {
    while (swapIndex < included.length && included[swapIndex]!.blockNumber <= checkpoint.blockNumber) {
      accumulate(state, included[swapIndex]!, input)
      swapIndex += 1
    }
    points.push({
      blockNumber: checkpoint.blockNumber,
      observedAt: checkpoint.observedAt,
      analysis: analysisFromAccumulator(input, state),
    })
  }

  return {
    entryBlockNumber: input.entryBlockNumber,
    processedSwapCount: state.swapCount,
    excludedAtOrBeforeEntrySwapCount,
    checkpoints: points,
    assumptions: [
      'Only swaps strictly after the entry block are eligible for position fee accrual.',
      'Each checkpoint includes eligible swaps through its block number, ordered by block number and log index.',
      'All checkpoint snapshots are emitted from one cumulative pass over the validated swap sequence.',
    ],
  }
}
