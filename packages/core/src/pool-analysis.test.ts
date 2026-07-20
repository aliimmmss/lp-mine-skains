import { describe, expect, it } from 'vitest'
import type { TokenRef } from './index.js'
import {
  analyzePool,
  compareFeeTierPools,
  formatRatio,
  sqrtPriceX96ToToken1PerToken0,
  type PoolAnalysisInput,
} from './pool-analysis.js'

const token0: TokenRef = {
  chainId: 4663,
  address: '0x0000000000000000000000000000000000000001',
  symbol: 'WETH',
  decimals: 18,
}

const token1: TokenRef = {
  chainId: 4663,
  address: '0x0000000000000000000000000000000000000002',
  symbol: 'USDG',
  decimals: 18,
}

function pool(overrides: Partial<PoolAnalysisInput> = {}): PoolAnalysisInput {
  return {
    poolAddress: '0x0000000000000000000000000000000000000010',
    token0,
    token1,
    feeTier: 500,
    sqrtPriceX96: 1n << 96n,
    activeLiquidity: 100n,
    observedAt: new Date('2026-07-20T10:00:00.000Z'),
    quality: 'complete',
    warnings: [],
    ...overrides,
  }
}

describe('sqrtPriceX96ToToken1PerToken0', () => {
  it('returns an exact 1:1 human-unit price at Q96 for equal decimals', () => {
    expect(sqrtPriceX96ToToken1PerToken0(1n << 96n, 18, 18)).toEqual({ numerator: 1n, denominator: 1n })
  })

  it('adjusts the exact price for token decimals', () => {
    expect(sqrtPriceX96ToToken1PerToken0(1n << 96n, 18, 6)).toEqual({
      numerator: 1_000_000_000_000n,
      denominator: 1n,
    })
  })
})

describe('formatRatio', () => {
  it('formats without floating point conversion', () => {
    expect(formatRatio({ numerator: 1n, denominator: 3n }, 6)).toBe('0.333333')
  })
})

describe('analyzePool', () => {
  it('separates exact price, fee rate, and risk flags', () => {
    const analysis = analyzePool(pool(), {
      now: new Date('2026-07-20T10:01:00.000Z'),
      staleAfterSeconds: 300,
    })

    expect(analysis.token1PerToken0).toEqual({ numerator: 1n, denominator: 1n })
    expect(analysis.feeRate).toEqual({ numerator: 1n, denominator: 2_000n })
    expect(analysis.riskFlags).toEqual([])
    expect(analysis.rankingBasis).toBe('active-liquidity-only')
  })

  it('flags zero liquidity, stale data, and incomplete sources', () => {
    const analysis = analyzePool(pool({ activeLiquidity: 0n, quality: 'partial' }), {
      now: new Date('2026-07-20T10:10:00.000Z'),
      staleAfterSeconds: 300,
    })

    expect(analysis.riskFlags).toEqual(['zero-active-liquidity', 'stale-snapshot', 'incomplete-source'])
  })
})

describe('compareFeeTierPools', () => {
  it('ranks same-pair pools by active liquidity and labels the limitation', () => {
    const report = compareFeeTierPools(
      [
        pool({ feeTier: 3_000, activeLiquidity: 50n }),
        pool({
          feeTier: 500,
          activeLiquidity: 200n,
          poolAddress: '0x0000000000000000000000000000000000000020',
        }),
        pool({
          feeTier: 100,
          activeLiquidity: 200n,
          poolAddress: '0x0000000000000000000000000000000000000030',
        }),
      ],
      { now: new Date('2026-07-20T10:01:00.000Z') },
    )

    expect(report.pools.map((item) => item.feeTier)).toEqual([100, 500, 3_000])
    expect(report.disclaimer).toContain('not an estimate of fees')
  })
})
