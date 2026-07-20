export type ChainId = number

export type BlockRef = {
  chainId: ChainId
  blockNumber: bigint
  observedAt: Date
}

export type TokenRef = {
  chainId: ChainId
  address: `0x${string}`
  symbol: string
  decimals: number
}

export type DataQuality = 'complete' | 'partial' | 'stale'

export type SourceStamped<T> = {
  value: T
  block: BlockRef
  quality: DataQuality
  warnings: readonly string[]
}

export { analyzePool, compareFeeTierPools, formatRatio, sqrtPriceX96ToToken1PerToken0 } from './pool-analysis.js'
export type {
  ExactRatio,
  PoolAnalysis,
  PoolAnalysisInput,
  PoolAnalysisOptions,
  PoolComparisonReport,
  PoolRiskFlag,
} from './pool-analysis.js'
export { analyzePoolHistory } from './pool-history.js'
export type {
  PoolHistoryAnalysis,
  PoolHistoryInput,
  PoolHistoryObservationInput,
  PoolHistoryOptions,
  PoolHistoryRiskFlag,
} from './pool-history.js'
