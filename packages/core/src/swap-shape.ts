export type CanonicalSwapDirection = 'token0-input' | 'token1-input'

export function classifyCanonicalSwap(amount0: bigint, amount1: bigint): CanonicalSwapDirection {
  if (amount0 === 0n || amount1 === 0n) {
    throw new RangeError('Canonical swap token deltas must both be non-zero')
  }
  if (amount0 > 0n === amount1 > 0n) {
    throw new RangeError('Canonical swap token deltas must have opposite signs')
  }
  return amount0 > 0n ? 'token0-input' : 'token1-input'
}
