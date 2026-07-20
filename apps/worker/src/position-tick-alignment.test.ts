import { describe, expect, it } from 'vitest'
import { readPositionFeeShareReportConfig } from './position-fee-share-config.js'

const required = {
  LP_MINE_POSITION_FEE_TIER: '500',
  LP_MINE_POSITION_TICK_LOWER: '-100',
  LP_MINE_POSITION_TICK_UPPER: '100',
  LP_MINE_POSITION_LIQUIDITY: '123456789',
}

describe('position tick alignment', () => {
  it('accepts canonical spacing and rejects misaligned bounds', () => {
    expect(readPositionFeeShareReportConfig(required).tickLower).toBe(-100)
    expect(() =>
      readPositionFeeShareReportConfig({
        ...required,
        LP_MINE_POSITION_TICK_LOWER: '-101',
      }),
    ).toThrow(/tick spacing 10/)
  })
})
