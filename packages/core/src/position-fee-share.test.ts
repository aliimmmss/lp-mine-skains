import { describe, expect, it } from 'vitest'
import {
  estimatePositionFeeShare,
  estimatePositionFeeShareTimeline,
  type PositionFeeShareInput,
} from './position-fee-share.js'

const hash = (value: number): `0x${string}` => `0x${value.toString(16).padStart(64, '0')}`

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
        transactionHash: hash(1),
        logIndex: 0,
        observedAt: new Date('2026-07-20T10:00:00.000Z'),
        amount0: 2_000_000n,
        amount1: -1_000_000n,
        tickAfter: 0,
        activeLiquidityAfter: 900n,
      },
      {
        blockNumber: 2n,
        transactionHash: hash(2),
        logIndex: 0,
        observedAt: new Date('2026-07-20T10:01:00.000Z'),
        amount0: -1_000_000n,
        amount1: 4_000_000n,
        tickAfter: 150,
        activeLiquidityAfter: 900n,
      },
      {
        blockNumber: 3n,
        transactionHash: hash(3),
        logIndex: 0,
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
  it('produces endpoint estimates and aggregate conservative path ceilings', () => {
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
    expect(result.disclaimer).toContain('validated swap endpoints')
  })

  it('uses supplied predecessor evidence for the first swap', () => {
    const result = estimatePositionFeeShare(input({ initialTick: -50 }))
    expect(result.unknownStartTickSwapCount).toBe(0)
    expect(result.knownStartTickSwapCount).toBe(3)
    expect(result.assumptions.join(' ')).toContain('supplied initial tick')
  })

  it('excludes swaps whose known path and endpoint stay outside the range', () => {
    const result = estimatePositionFeeShare(
      input({
        initialTick: 150,
        swaps: [
          {
            blockNumber: 1n,
            transactionHash: hash(1),
            logIndex: 0,
            observedAt: new Date('2026-07-20T10:00:00.000Z'),
            amount0: 2_000_000n,
            amount1: -1_000_000n,
            tickAfter: 200,
            activeLiquidityAfter: 900n,
          },
          {
            blockNumber: 2n,
            transactionHash: hash(2),
            logIndex: 0,
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
    expect(result.pathIntersectingSwapCount).toBe(0)
    expect(result.token0.endpointEstimateBaseUnits).toBe(0n)
    expect(result.token0.upperBoundBaseUnits).toBe(0n)
  })

  it('uses one aggregate ceiling instead of summing per-swap floors', () => {
    const result = estimatePositionFeeShare(
      input({
        feeTier: 100,
        initialTick: 0,
        swaps: [
          {
            blockNumber: 1n,
            transactionHash: hash(1),
            logIndex: 0,
            observedAt: new Date('2026-07-20T10:00:00.000Z'),
            amount0: 1n,
            amount1: -1n,
            tickAfter: 0,
            activeLiquidityAfter: 900n,
          },
          {
            blockNumber: 1n,
            transactionHash: hash(1),
            logIndex: 1,
            observedAt: new Date('2026-07-20T10:00:00.000Z'),
            amount0: 1n,
            amount1: -1n,
            tickAfter: 0,
            activeLiquidityAfter: 900n,
          },
        ],
      }),
    )
    expect(result.token0.upperBoundBaseUnits).toBe(1n)
  })

  it('validates range, liquidity, and canonical deltas', () => {
    expect(() => estimatePositionFeeShare(input({ tickLower: 100, tickUpper: 100 }))).toThrow(/tickLower/)
    expect(() => estimatePositionFeeShare(input({ positionLiquidity: 0n }))).toThrow(/positive/)
    expect(() => estimatePositionFeeShare(input({ swaps: [] }))).toThrow(/At least one swap/)
    expect(() =>
      estimatePositionFeeShare(
        input({
          swaps: [
            {
              blockNumber: 1n,
              transactionHash: hash(1),
              logIndex: 0,
              observedAt: new Date('2026-07-20T10:00:00.000Z'),
              amount0: 1n,
              amount1: 1n,
              tickAfter: 0,
              activeLiquidityAfter: 1n,
            },
          ],
        }),
      ),
    ).toThrow(/opposite signs/)
  })
})

describe('estimatePositionFeeShareTimeline', () => {
  it('excludes entry-block swaps and emits cumulative block checkpoints in one pass', () => {
    const swaps = [
      {
        blockNumber: 10n,
        transactionHash: hash(10),
        logIndex: 0,
        observedAt: new Date('2026-07-20T10:00:00.000Z'),
        amount0: 2_000_000n,
        amount1: -1_000_000n,
        tickAfter: 0,
        activeLiquidityAfter: 900n,
      },
      {
        blockNumber: 11n,
        transactionHash: hash(11),
        logIndex: 0,
        observedAt: new Date('2026-07-20T10:00:00.000Z'),
        amount0: 2_000_000n,
        amount1: -1_000_000n,
        tickAfter: 50,
        activeLiquidityAfter: 900n,
      },
      {
        blockNumber: 12n,
        transactionHash: hash(12),
        logIndex: 0,
        observedAt: new Date('2026-07-20T10:00:00.000Z'),
        amount0: -1_000_000n,
        amount1: 4_000_000n,
        tickAfter: 150,
        activeLiquidityAfter: 900n,
      },
    ] as const

    const result = estimatePositionFeeShareTimeline({
      ...input({ swaps: [] }),
      initialTick: 0,
      entryBlockNumber: 10n,
      checkpoints: [
        { blockNumber: 10n, observedAt: new Date('2026-07-20T10:00:00.000Z') },
        { blockNumber: 11n, observedAt: new Date('2026-07-20T10:00:00.000Z') },
        { blockNumber: 12n, observedAt: new Date('2026-07-20T10:00:00.000Z') },
      ],
      swaps,
    })

    expect(result.excludedAtOrBeforeEntrySwapCount).toBe(1)
    expect(result.processedSwapCount).toBe(2)
    expect(result.checkpoints.map((point) => point.analysis.swapCount)).toEqual([0, 1, 2])
    expect(result.checkpoints[0]?.analysis.token0.endpointEstimateBaseUnits).toBe(0n)
    expect(result.checkpoints[1]?.analysis.token0.endpointEstimateBaseUnits).toBe(100n)
    expect(result.checkpoints[2]?.analysis.token1.upperBoundBaseUnits).toBe(2_000n)
  })

  it('matches the full-window estimator at the final checkpoint', () => {
    const parameters = input({ initialTick: -50 })
    const timeline = estimatePositionFeeShareTimeline({
      ...parameters,
      entryBlockNumber: 0n,
      checkpoints: [{ blockNumber: 3n, observedAt: new Date('2026-07-20T10:02:00.000Z') }],
    })
    const legacy = estimatePositionFeeShare(parameters)

    expect(timeline.checkpoints[0]?.analysis).toEqual(legacy)
  })

  it('rejects non-increasing checkpoint blocks', () => {
    expect(() =>
      estimatePositionFeeShareTimeline({
        ...input(),
        entryBlockNumber: 0n,
        checkpoints: [
          { blockNumber: 2n, observedAt: new Date('2026-07-20T10:01:00.000Z') },
          { blockNumber: 2n, observedAt: new Date('2026-07-20T10:02:00.000Z') },
        ],
      }),
    ).toThrow(/increase strictly/)
  })
})
