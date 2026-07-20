import { describe, expect, it } from 'vitest'
import type { TokenRef } from './index.js'
import { analyzeLpVsHodl } from './lp-vs-hodl.js'
import {
  formatHumanTokenPrice,
  formatLpVsHodlAnalysis,
  formatTokenAmountBaseUnits,
  formatTokenValueBaseUnits,
} from './accounting-display.js'

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
  decimals: 6,
}

const Q96 = 1n << 96n

describe('accounting display formatting', () => {
  it('formats token base units exactly without floating point', () => {
    expect(formatTokenAmountBaseUnits(1_234_500n, 6)).toBe('1.2345')
    expect(formatTokenAmountBaseUnits(-1_000_000_000_000_000_001n, 18)).toBe('-1.000000000000000001')
    expect(formatTokenAmountBaseUnits(0n, 18)).toBe('0')
  })

  it('formats signed rational token values', () => {
    expect(formatTokenValueBaseUnits({ numerator: -3_000_000n, denominator: 2n }, 6, 6)).toBe('-1.500000')
    expect(formatTokenValueBaseUnits({ numerator: -500_000n, denominator: 1n }, 6, 6)).toBe('-0.500000')
  })

  it('converts raw base-unit price into human token units', () => {
    expect(formatHumanTokenPrice({ numerator: 1n, denominator: 1n }, 18, 6, 2)).toBe('1000000000000.00')
  })

  it('builds a human-readable companion without changing accounting evidence', () => {
    const accounting = analyzeLpVsHodl({
      token0,
      token1,
      tickLower: -100,
      tickUpper: 100,
      liquidity: 1_000_000_000_000n,
      entrySqrtPriceX96: Q96,
      exitSqrtPriceX96: Q96,
      fees0: 1_000_000_000_000_000_000n,
      fees1: 1_500_000n,
    })

    const display = formatLpVsHodlAnalysis(accounting, token0, token1)
    expect(display.fees).toEqual({ amount0: '1', amount1: '1.5' })
    expect(display.token0Symbol).toBe('WETH')
    expect(display.token1Symbol).toBe('USDG')
    expect(accounting.fees.amount0).toBe(1_000_000_000_000_000_000n)
  })
})
