import { describe, expect, it } from 'vitest'
import type { PoolSnapshot } from './index.js'
import {
  PoolIntegrityError,
  assertCanonicalPoolSnapshot,
  canonicalPoolForFeeTier,
  validateCanonicalPositionRange,
} from './pool-integrity.js'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_TOKENS } from './registry.js'

function snapshot(overrides: Partial<PoolSnapshot['value']> = {}): PoolSnapshot {
  const pool = canonicalPoolForFeeTier(500)
  return {
    value: {
      poolAddress: pool.poolAddress,
      token0: {
        chainId: ROBINHOOD_CHAIN_ID,
        address: ROBINHOOD_TOKENS.wrappedNative,
        symbol: 'WETH',
        decimals: 18,
      },
      token1: {
        chainId: ROBINHOOD_CHAIN_ID,
        address: ROBINHOOD_TOKENS.usdg,
        symbol: 'USDG',
        decimals: 6,
      },
      feeTier: 500,
      sqrtPriceX96: 1n << 96n,
      tick: 0,
      tickSpacing: 10,
      activeLiquidity: 1_000_000n,
      ...overrides,
    },
    block: { chainId: ROBINHOOD_CHAIN_ID, blockNumber: 1n, observedAt: new Date('2026-07-20T00:00:00.000Z') },
    quality: 'complete',
    warnings: [],
  }
}

describe('canonical pool integrity', () => {
  it('accepts aligned position ticks for every canonical tier', () => {
    expect(canonicalPoolForFeeTier(500)).toMatchObject({ feeTier: 500, tickSpacing: 10 })
    expect(validateCanonicalPositionRange({ feeTier: 100, tickLower: -1, tickUpper: 1 }).tickSpacing).toBe(1)
    expect(validateCanonicalPositionRange({ feeTier: 500, tickLower: -100, tickUpper: 100 }).tickSpacing).toBe(10)
    expect(validateCanonicalPositionRange({ feeTier: 3000, tickLower: -120, tickUpper: 120 }).tickSpacing).toBe(60)
    expect(validateCanonicalPositionRange({ feeTier: 10_000, tickLower: -400, tickUpper: 400 }).tickSpacing).toBe(200)
  })

  it('rejects unsupported tiers and misaligned bounds', () => {
    expect(() => validateCanonicalPositionRange({ feeTier: 2500, tickLower: -100, tickUpper: 100 })).toThrow(
      PoolIntegrityError,
    )
    expect(() => validateCanonicalPositionRange({ feeTier: 500, tickLower: -101, tickUpper: 100 })).toThrow(
      /tick spacing 10/,
    )
  })

  it('accepts canonical stored metadata', () => {
    expect(() => assertCanonicalPoolSnapshot(snapshot(), canonicalPoolForFeeTier(500))).not.toThrow()
  })

  it('rejects token-order, decimal, and spacing mismatches', () => {
    const expected = canonicalPoolForFeeTier(500)
    expect(() =>
      assertCanonicalPoolSnapshot(
        snapshot({
          token0: {
            chainId: ROBINHOOD_CHAIN_ID,
            address: ROBINHOOD_TOKENS.usdg,
            symbol: 'USDG',
            decimals: 6,
          },
        }),
        expected,
      ),
    ).toThrow(/token0 address/)
    expect(() =>
      assertCanonicalPoolSnapshot(
        snapshot({
          token1: {
            chainId: ROBINHOOD_CHAIN_ID,
            address: ROBINHOOD_TOKENS.usdg,
            symbol: 'USDG',
            decimals: 18,
          },
        }),
        expected,
      ),
    ).toThrow(/token1 decimals/)
    expect(() => assertCanonicalPoolSnapshot(snapshot({ tickSpacing: 60 }), expected)).toThrow(/tick spacing/)
  })
})
