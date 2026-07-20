import { describe, expect, it } from 'vitest'
import { readPositionFeeShareReportConfig } from './position-fee-share-config.js'

describe('readPositionFeeShareReportConfig', () => {
  it('reads required position inputs and defaults', () => {
    expect(
      readPositionFeeShareReportConfig({
        LP_MINE_POSITION_FEE_TIER: '500',
        LP_MINE_POSITION_TICK_LOWER: '-100',
        LP_MINE_POSITION_TICK_UPPER: '100',
        LP_MINE_POSITION_LIQUIDITY: '123456789',
      }),
    ).toEqual({
      databasePath: './data/robinhood-univ3.sqlite',
      feeTier: 500,
      tickLower: -100,
      tickUpper: 100,
      positionLiquidity: 123456789n,
      windowSeconds: 86_400,
      limit: 10_000,
    })
  })

  it('rejects missing and invalid position inputs', () => {
    expect(() => readPositionFeeShareReportConfig({})).toThrow(/FEE_TIER/)
    expect(() =>
      readPositionFeeShareReportConfig({
        LP_MINE_POSITION_FEE_TIER: '500',
        LP_MINE_POSITION_TICK_LOWER: '100',
        LP_MINE_POSITION_TICK_UPPER: '100',
        LP_MINE_POSITION_LIQUIDITY: '1',
      }),
    ).toThrow(/less than/)
    expect(() =>
      readPositionFeeShareReportConfig({
        LP_MINE_POSITION_FEE_TIER: '500',
        LP_MINE_POSITION_TICK_LOWER: '-100',
        LP_MINE_POSITION_TICK_UPPER: '100',
        LP_MINE_POSITION_LIQUIDITY: '0',
      }),
    ).toThrow(/positive/)
  })
})
