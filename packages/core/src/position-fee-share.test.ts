import { describe, expect, it } from 'vitest'
import { estimatePositionFeeShare, type PositionFeeShareInput } from './position-fee-share.js'

function input(overrides: Partial<PositionFeeShareInput> = {}): PositionFeeShareInput {
  return {
    poolAddress: '0x0000000000000000000000000000000000000001',
    feeTier: 500,
    tickLower: -100,
    tickUpper: 100,
    positionLiquidity: 100n,
    token0Decimals: 6,
    token1Decimals: 6,
    swaps: [
      {
        blockNumber: 1n,
        observedAt: new Date('2026-07-20T10:00:00.000Z'),
        amount0: 2_000_000n,
        amount1: -1_000_000n,
        tickAfter: 0,
        activeLiquidityAfter: 900n,
      },
      {
        blockNumber: 2n,
        observedAt: new Date('2026-07-20T10:01:00.000Z'),
        amount0: -1_000_000n,
        amount1: 4_000_000n,
        tickAfter: 150,
        activeLiquidityAfter: 900n,
      },
      {
        blockNumber: 3n,
        observedAt: new Date('2026-07-20T10:02:00.000Z'),
        amount0: 2_000_000n,
        amount1: -1_000_000n,
        tickAfter: 50,
        activeLiquidityAfter: 900n,
      },
    ],
    ...overrides,
  }
}

describe('estimatePositionFeeShare', () => {
  it('produces endpoint estimates and conservative path bounds', () => {
    const result = estimatePositionFeeShare(input())

    expect(result.swapCount).toBe(3)
    expect(result.unknownStartTickSwapCount).toBe(1)
    expect(result.knownStartTickSwapCount).toBe(2)
    expect(result.endpointInRangeSwapCount).toBe(2)
    expect(result.pathIntersectingSwapCount).toBe(3)
    expect(result.token0.lowerBoundBaseUnits).toBe(0n)
    expect(result.token0.endpointEstimateBaseUnits).toBe(200n)
    expect(result.token0.upperBoundBaseUnits).toBe(2_000n)
    expect(result.token1.endpointEstimateBaseUnits).toBe(0n)
    expect(result.token1.upperBoundBaseUnits).toBe(2_000n)
    expect(result.disclaimer).toContain('not realized fees')
  })

  it('excludes swaps whose path and endpoint stay outside the range', () => {
    const result = estimatePositionFeeShare(
      input({
        swaps: [
          {
            blockNumber: 1n,
            observedAt: new Date('2026-07-20T10:00:00.000Z'),
            amount0: 2_000_000n,
            amount1: -1_000_000n,
            tickAfter: 200,
            activeLiquidityAfter: 900n,
          },
          {
            blockNumber: 2n,
            observedAt: new Date('2026-07-20T10:01:00.000Z'),
            amount0: 2_000_000n,
            amount1: -1_000_000n,
            tickAfter: 250,
            activeLiquidityAfter: 900n,
          },
        ],
      }),
    )

    expect(result.endpointInRangeSwapCount).toBe(0)
    expect(result.pathIntersectingSwapCount).toBe(1)
    expect(result.token0.endpointEstimateBaseUnits).toBe(0n)
    expect(result.token0.upperBoundBaseUnits).toBe(1_000n)
  })

  it('validates the proposed range and liquidity', () => {
    expect(() => estimatePositionFeeShare(input({ tickLower: 100, tickUpper: 100 }))).toThrow(/tickLower/)
    expect(() => estimatePositionFeeShare(input({ positionLiquidity: 0n }))).toThrow(/positive/)
    expect(() => estimatePositionFeeShare(input({ swaps: [] }))).toThrow(/At least one swap/)
  })
})
