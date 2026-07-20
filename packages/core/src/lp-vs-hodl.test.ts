import { describe, expect, it } from 'vitest'
import type { TokenRef } from './index.js'
import {
  MAX_UNISWAP_V3_SQRT_RATIO_X96,
  MAX_UNISWAP_V3_TICK,
  MIN_UNISWAP_V3_SQRT_RATIO_X96,
  MIN_UNISWAP_V3_TICK,
  amountsForLiquidity,
  analyzeLpVsHodl,
  tickToSqrtPriceX96,
} from './lp-vs-hodl.js'

const Q96 = 1n << 96n
const token0: TokenRef = {
  chainId: 1,
  address: '0x0000000000000000000000000000000000000001',
  symbol: 'T0',
  decimals: 18,
}
const token1: TokenRef = {
  chainId: 1,
  address: '0x0000000000000000000000000000000000000002',
  symbol: 'T1',
  decimals: 6,
}

describe('LP versus HODL accounting', () => {
  it('matches canonical TickMath boundary vectors', () => {
    expect(tickToSqrtPriceX96(0)).toBe(Q96)
    expect(tickToSqrtPriceX96(MIN_UNISWAP_V3_TICK)).toBe(MIN_UNISWAP_V3_SQRT_RATIO_X96)
    expect(tickToSqrtPriceX96(MAX_UNISWAP_V3_TICK)).toBe(MAX_UNISWAP_V3_SQRT_RATIO_X96)
    expect(tickToSqrtPriceX96(-1)).toBeLessThan(Q96)
    expect(tickToSqrtPriceX96(1)).toBeGreaterThan(Q96)
  })

  it('matches artificial LiquidityAmounts vectors with sequential floors', () => {
    const lower = Q96
    const current = 2n * Q96
    const upper = 4n * Q96
    const liquidity = 8n

    expect(amountsForLiquidity(current, lower, upper, liquidity)).toEqual({ amount0: 2n, amount1: 8n })
    expect(amountsForLiquidity(lower, lower, upper, liquidity)).toEqual({ amount0: 6n, amount1: 0n })
    expect(amountsForLiquidity(upper, lower, upper, liquidity)).toEqual({ amount0: 0n, amount1: 24n })
  })

  it('returns one-sided inventory outside the range', () => {
    const lower = tickToSqrtPriceX96(-100)
    const upper = tickToSqrtPriceX96(100)
    const liquidity = 1_000_000_000_000n

    const below = amountsForLiquidity(tickToSqrtPriceX96(-200), lower, upper, liquidity)
    const above = amountsForLiquidity(tickToSqrtPriceX96(200), lower, upper, liquidity)

    expect(below.amount0).toBeGreaterThan(0n)
    expect(below.amount1).toBe(0n)
    expect(above.amount0).toBe(0n)
    expect(above.amount1).toBeGreaterThan(0n)
  })

  it('has zero divergence when entry and exit prices match', () => {
    const result = analyzeLpVsHodl({
      token0,
      token1,
      tickLower: -100,
      tickUpper: 100,
      liquidity: 1_000_000_000_000n,
      entrySqrtPriceX96: Q96,
      exitSqrtPriceX96: Q96,
    })

    expect(result.pair).toBe('T0/T1')
    expect(result.entryInventory).toEqual(result.exitInventory)
    expect(result.divergenceToken1BaseUnits.numerator).toBe(0n)
    expect(result.divergenceLossToken1BaseUnits.numerator).toBe(0n)
    expect(result.netVsHodlToken1BaseUnits.numerator).toBe(0n)
  })

  it('keeps supplied fees separate from principal divergence', () => {
    const withoutFees = analyzeLpVsHodl({
      token0,
      token1,
      tickLower: -100,
      tickUpper: 100,
      liquidity: 1_000_000_000_000n,
      entrySqrtPriceX96: Q96,
      exitSqrtPriceX96: tickToSqrtPriceX96(80),
    })
    const withFees = analyzeLpVsHodl({
      token0,
      token1,
      tickLower: -100,
      tickUpper: 100,
      liquidity: 1_000_000_000_000n,
      entrySqrtPriceX96: Q96,
      exitSqrtPriceX96: tickToSqrtPriceX96(80),
      fees0: 10n,
      fees1: 20n,
    })

    expect(withFees.divergenceToken1BaseUnits).toEqual(withoutFees.divergenceToken1BaseUnits)
    expect(withFees.divergenceLossToken1BaseUnits).toEqual(withoutFees.divergenceLossToken1BaseUnits)
    expect(withFees.feeValueToken1BaseUnits.numerator).toBeGreaterThan(0n)
    expect(
      withFees.netVsHodlToken1BaseUnits.numerator * withoutFees.netVsHodlToken1BaseUnits.denominator,
    ).toBeGreaterThan(withoutFees.netVsHodlToken1BaseUnits.numerator * withFees.netVsHodlToken1BaseUnits.denominator)
  })

  it('rejects invalid token, tick, liquidity, and price inputs', () => {
    expect(() => tickToSqrtPriceX96(MAX_UNISWAP_V3_TICK + 1)).toThrow(/outside/)
    expect(() =>
      analyzeLpVsHodl({
        token0,
        token1: { ...token1, chainId: 2 },
        tickLower: -100,
        tickUpper: 100,
        liquidity: 1n,
        entrySqrtPriceX96: Q96,
        exitSqrtPriceX96: Q96,
      }),
    ).toThrow(/same chainId/)
    expect(() =>
      analyzeLpVsHodl({
        token0,
        token1: { ...token1, address: token0.address },
        tickLower: -100,
        tickUpper: 100,
        liquidity: 1n,
        entrySqrtPriceX96: Q96,
        exitSqrtPriceX96: Q96,
      }),
    ).toThrow(/distinct/)
    expect(() =>
      analyzeLpVsHodl({
        token0,
        token1,
        tickLower: 10,
        tickUpper: 10,
        liquidity: 1n,
        entrySqrtPriceX96: Q96,
        exitSqrtPriceX96: Q96,
      }),
    ).toThrow(/ordered/)
    expect(() =>
      analyzeLpVsHodl({
        token0,
        token1,
        tickLower: -100,
        tickUpper: 100,
        liquidity: 1n << 128n,
        entrySqrtPriceX96: Q96,
        exitSqrtPriceX96: Q96,
      }),
    ).toThrow(/uint128/)
    expect(() =>
      analyzeLpVsHodl({
        token0,
        token1,
        tickLower: -100,
        tickUpper: 100,
        liquidity: 1n,
        entrySqrtPriceX96: MIN_UNISWAP_V3_SQRT_RATIO_X96 - 1n,
        exitSqrtPriceX96: Q96,
      }),
    ).toThrow(/sqrt-price bounds/)
  })
})
