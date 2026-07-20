import { describe, expect, it } from 'vitest'
import { readPositionFeeShareReportConfig } from './position-fee-share-config.js'

const required = {
  LP_MINE_POSITION_FEE_TIER: '500',
  LP_MINE_POSITION_TICK_LOWER: '-100',
  LP_MINE_POSITION_TICK_UPPER: '100',
  LP_MINE_POSITION_LIQUIDITY: '123456789',
}

describe('readPositionFeeShareReportConfig', () => {
  it('reads required position inputs and defaults', () => {
    expect(readPositionFeeShareReportConfig(required)).toEqual({
      databasePath: './data/robinhood-univ3.sqlite',
      feeTier: 500,
      tickLower: -100,
      tickUpper: 100,
      positionLiquidity: 123456789n,
      windowSeconds: 86_400,
      limit: 10_000,
      realizedFees: null,
      costs: [
        { category: 'gas', amount0: 0n, amount1: 0n },
        { category: 'slippage', amount0: 0n, amount1: 0n },
        { category: 'rebalance', amount0: 0n, amount1: 0n },
        { category: 'other', amount0: 0n, amount1: 0n },
      ],
      costsSupplied: false,
    })
  })

  it('reads explicit realized fees and categorized costs with shared provenance', () => {
    const result = readPositionFeeShareReportConfig({
      ...required,
      LP_MINE_POSITION_REALIZED_FEES0: '10',
      LP_MINE_POSITION_REALIZED_FEES1: '20',
      LP_MINE_POSITION_GAS_COST1: '5',
      LP_MINE_POSITION_REBALANCE_COST0: '2',
      LP_MINE_POSITION_EVIDENCE_SOURCE: 'wallet-reconciliation',
      LP_MINE_POSITION_EVIDENCE_OBSERVED_AT: '2026-07-20T10:30:00.000Z',
      LP_MINE_POSITION_EVIDENCE_REFERENCE: 'batch-42',
    })

    const provenance = {
      source: 'wallet-reconciliation',
      observedAt: new Date('2026-07-20T10:30:00.000Z'),
      reference: 'batch-42',
    }
    expect(result.realizedFees).toEqual({ amount0: 10n, amount1: 20n, provenance })
    expect(result.costsSupplied).toBe(true)
    expect(result.costs).toContainEqual({ category: 'gas', amount0: 0n, amount1: 5n, provenance })
    expect(result.costs).toContainEqual({ category: 'rebalance', amount0: 2n, amount1: 0n, provenance })
    expect(result.costs).toContainEqual({ category: 'slippage', amount0: 0n, amount1: 0n })
  })

  it('rejects missing and invalid position inputs', () => {
    expect(() => readPositionFeeShareReportConfig({})).toThrow(/FEE_TIER/)
    expect(() =>
      readPositionFeeShareReportConfig({
        ...required,
        LP_MINE_POSITION_TICK_LOWER: '100',
      }),
    ).toThrow(/less than/)
    expect(() =>
      readPositionFeeShareReportConfig({
        ...required,
        LP_MINE_POSITION_LIQUIDITY: '0',
      }),
    ).toThrow(/positive/)
    expect(() =>
      readPositionFeeShareReportConfig({
        ...required,
        LP_MINE_POSITION_REALIZED_FEES0: '1',
      }),
    ).toThrow(/required together/)
    expect(() =>
      readPositionFeeShareReportConfig({
        ...required,
        LP_MINE_POSITION_GAS_COST0: '-1',
      }),
    ).toThrow(/non-negative/)
    expect(() =>
      readPositionFeeShareReportConfig({
        ...required,
        LP_MINE_POSITION_EVIDENCE_SOURCE: 'wallet-reconciliation',
      }),
    ).toThrow(/required together/)
    expect(() =>
      readPositionFeeShareReportConfig({
        ...required,
        LP_MINE_POSITION_EVIDENCE_SOURCE: 'wallet-reconciliation',
        LP_MINE_POSITION_EVIDENCE_OBSERVED_AT: 'not-a-date',
      }),
    ).toThrow(/valid timestamp/)
  })
})
