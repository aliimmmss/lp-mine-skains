import type { DataQuality, TokenRef } from './index.js'

const Q192 = 1n << 192n
const FEE_DENOMINATOR = 1_000_000n

export type ExactRatio = {
  numerator: bigint
  denominator: bigint
}

export type PoolAnalysisInput = {
  poolAddress: `0x${string}`
  token0: TokenRef
  token1: TokenRef
  feeTier: number
  sqrtPriceX96: bigint
  activeLiquidity: bigint
  observedAt: Date
  quality: DataQuality
  warnings: readonly string[]
}

export type PoolRiskFlag = 'zero-active-liquidity' | 'stale-snapshot' | 'incomplete-source'

export type