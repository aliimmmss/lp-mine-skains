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
  lowerBoundDecimal: