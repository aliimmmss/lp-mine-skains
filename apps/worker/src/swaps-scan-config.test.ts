import { describe, expect, it } from 'vitest'
import { readSwapScanConfig } from './swaps-scan-config.js'

describe('readSwapScanConfig', () => {
  it('requires an explicit start block and applies bounded defaults', () => {
    expect(() => readSwapScanConfig({})).toThrow(/LP_MINE_SWAP_START_BLOCK/)
    expect(readSwapScanConfig({ LP_MINE_SWAP_START_BLOCK: '123' })).toEqual({
      startBlock: 123n,
      confirmationDepth: 12n,
      maxBlockSpan: 2_000n,
      databasePath: './data/robinhood-univ3.sqlite',
    })
  })

  it('rejects invalid unsigned values', () => {
    expect(() =>
      readSwapScanConfig({
        LP_MINE_SWAP_START_BLOCK: '1',
        LP_MINE_SWAP_MAX_BLOCK_SPAN: '0',
      }),
    ).toThrow(/positive/)
  })
})
