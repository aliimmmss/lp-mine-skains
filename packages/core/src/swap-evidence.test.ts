import { describe, expect, it } from 'vitest'
import type { TokenRef } from './index.js'
import { analyzeSwapEvidence } from './swap-evidence.js'

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

describe('analyzeSwapEvidence', () => {
  it('aggregates directional flow and exact nominal fee evidence', () => {
    const result = analyzeSwapEvidence({
      poolAddress: '0x0000000000000000000000000000000000000010',
      token0,
      token1,
      quoteToken: 'token1',
      feeTier: 500,
      observations: [
        {
          blockNumber: 2n,
          observedAt: new Date('2026-07-20T10:05:00.000Z'),
          amount0: -1_000_000_000_000_000_000n,
          amount1: 2_000_000_000n,
        },
        {
          blockNumber: 1n,
          observedAt: new Date('2026-07-20T10:00:00.000Z'),
          amount0: 500_000_000_000_000_000n,
          amount1: -1_100_000_000n,
        },
      ],
    })

    expect(result.swapCount).toBe(2)
    expect(result.token0InputSwapCount).toBe(1)
    expect(result.token1InputSwapCount).toBe(1)
    expect(result.token0.inputBaseUnits).toBe(500_000_000_000_000_000n)
    expect(result.token0.outputBaseUnits).toBe(1_000_000_000_000_000_000n)
    expect(result.token1.inputBaseUnits).toBe(2_000_000_000n)
    expect(result.token1.outputBaseUnits).toBe(1_100_000_000n)
    expect(result.quoteNotionalDecimal).toBe('3100.000000')
    expect(result.token1.nominalGrossFee.floorBaseUnits).toBe(1_000_000n)
    expect(result.token1.nominalGrossFee.ceilingBaseUnits).toBe(1_000_000n)
    expect(result.firstBlock).toBe(1n)
    expect(result.lastBlock).toBe(2n)
    expect(result.disclaimer).toContain('not collectible LP fees')
  })

  it('reports integer floor and ceiling when nominal fees are fractional base units', () => {
    const result = analyzeSwapEvidence({
      poolAddress: '0x0000000000000000000000000000000000000010',
      token0,
      token1,
      quoteToken: 'token1',
      feeTier: 100,
      observations: [
        {
          blockNumber: 1n,
          observedAt: new Date('2026-07-20T10:00:00.000Z'),
          amount0: -1n,
          amount1: 1n,
        },
      ],
    })

    expect(result.token1.nominalGrossFee.exactBaseUnits).toEqual({ numerator: 1n, denominator: 10_000n })
    expect(result.token1.nominalGrossFee.floorBaseUnits).toBe(0n)
    expect(result.token1.nominalGrossFee.ceilingBaseUnits).toBe(1n)
  })
})
