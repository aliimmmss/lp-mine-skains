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
