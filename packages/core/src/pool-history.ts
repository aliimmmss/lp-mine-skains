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
 