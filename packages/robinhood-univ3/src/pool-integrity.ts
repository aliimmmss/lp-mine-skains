import { getAddress } from 'viem'
import type { PoolSnapshot } from './index.js'
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_TOKENS,
  ROBINHOOD_WETH_USDG_POOLS,
  type SupportedFeeTier,
} from './registry.js'

export type CanonicalPool = (typeof ROBINHOOD_WETH_USDG_POOLS)[number]

export class PoolIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PoolIntegrityError'
  }
}

export function canonicalPoolForFeeTier(feeTier: number): CanonicalPool {
  const pool = ROBINHOOD_WETH_USDG_POOLS.find((candidate) => candidate.feeTier === feeTier)
  if (!pool) throw new PoolIntegrityError(`Unsupported canonical fee tier: ${feeTier}`)
  return pool
}

export function validateCanonicalPositionRange(args: {
  feeTier: number
  tickLower: number
  tickUpper: number
}): CanonicalPool {
  const pool = canonicalPoolForFeeTier(args.feeTier)
  if (args.tickLower >= args.tickUpper) throw new PoolIntegrityError('Position tick lower must be less than tick upper')
  if (args.tickLower % pool.tickSpacing !== 0 || args.tickUpper % pool.tickSpacing !== 0) {
    throw new PoolIntegrityError(
      `Position ticks must align to canonical tick spacing ${pool.tickSpacing} for fee tier ${pool.feeTier}`,
    )
  }
  return pool
}

export function assertCanonicalPoolSnapshot(snapshot: PoolSnapshot, expected: CanonicalPool): void {
  const failures: string[] = []
  const value = snapshot.value

  if (snapshot.block.chainId !== ROBINHOOD_CHAIN_ID) failures.push('block chain ID')
  if (value.token0.chainId !== ROBINHOOD_CHAIN_ID || value.token1.chainId !== ROBINHOOD_CHAIN_ID) {
    failures.push('token chain ID')
  }
  if (getAddress(value.poolAddress) !== expected.poolAddress) failures.push('pool address')
  if (value.feeTier !== (expected.feeTier as SupportedFeeTier)) failures.push('fee tier')
  if (value.tickSpacing !== expected.tickSpacing) failures.push('tick spacing')
  if (getAddress(value.token0.address) !== ROBINHOOD_TOKENS.wrappedNative) failures.push('token0 address')
  if (getAddress(value.token1.address) !== ROBINHOOD_TOKENS.usdg) failures.push('token1 address')
  if (value.token0.decimals !== 18) failures.push('token0 decimals')
  if (value.token1.decimals !== 6) failures.push('token1 decimals')

  if (failures.length > 0) {
    throw new PoolIntegrityError(
      `Stored observation does not match canonical WETH/USDG pool metadata: ${failures.join(', ')}`,
    )
  }
}
