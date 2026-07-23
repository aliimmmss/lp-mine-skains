import { describe, expect, it } from 'vitest'
import { buildDepositPlan, type DepositPlanInput } from './deposit-plan.js'

function input(overrides: Partial<DepositPlanInput> = {}): DepositPlanInput {
  return {
    poolAddress: '0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a',
    feeTier: 500,
    tickSpacing: 10,
    currentTick: -200_000,
    token0Symbol: 'WETH',
    token1Symbol: 'USDG',
    token0Decimals: 18,
    token1Decimals: 6,
    ...overrides,
  }
}

describe('buildDepositPlan', () => {
  it('aligns the range to tick spacing around the current tick', () => {
    const plan = buildDepositPlan(input(), { rangePercent: 5 })
    // ±5% ≈ ±488 ticks around -200000; aligned to spacing 10
    expect(Number.isInteger(plan.tickLower / 10)).toBe(true)
    expect(Number.isInteger(plan.tickUpper / 10)).toBe(true)
    expect(plan.tickLower).toBeLessThan(-200_000)
    expect(plan.tickUpper).toBeGreaterThan(-200_000)
    expect(plan.tickLower).toBe(-200_490)
    expect(plan.tickUpper).toBe(-199_510)
  })

  it('derives an intuitive token1-per-token0 price band', () => {
    const plan = buildDepositPlan(input(), { rangePercent: 5 })
    // price(tick) = 1.0001^tick * 10^(dec0-dec1); at -200000 ≈ 2060 USDG per WETH
    expect(Number(plan.currentPriceToken1PerToken0)).toBeGreaterThan(1900)
    expect(Number(plan.currentPriceToken1PerToken0)).toBeLessThan(2200)
    expect(Number(plan.priceLowerToken1PerToken0)).toBeLessThan(Number(plan.currentPriceToken1PerToken0))
    expect(Number(plan.priceUpperToken1PerToken0)).toBeGreaterThan(Number(plan.currentPriceToken1PerToken0))
  })

  it('never produces an empty or inverted range even for a tiny width', () => {
    const plan = buildDepositPlan(input({ tickSpacing: 200 }), { rangePercent: 0.01 })
    expect(plan.tickUpper - plan.tickLower).toBeGreaterThanOrEqual(200)
    expect(plan.tickLower).toBeLessThan(plan.tickUpper)
  })

  it('rejects invalid inputs', () => {
    expect(() => buildDepositPlan(input({ tickSpacing: 0 }), { rangePercent: 5 })).toThrow(/tickSpacing/)
    expect(() => buildDepositPlan(input(), { rangePercent: 0 })).toThrow(/rangePercent/)
  })
})
