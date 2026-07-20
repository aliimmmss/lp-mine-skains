import { describe, expect, it } from 'vitest'
import { readSwapEvidenceReportConfig } from './swaps-evidence-config.js'

describe('readSwapEvidenceReportConfig', () => {
  it('uses bounded defaults', () => {
    expect(readSwapEvidenceReportConfig({})).toEqual({
      databasePath: './data/robinhood-univ3.sqlite',
      windowSeconds: 86_400,
      limitPerPool: 10_000,
    })
  })

  it('reads explicit evidence controls', () => {
    expect(
      readSwapEvidenceReportConfig({
        LP_MINE_DATABASE_PATH: '/tmp/swaps.sqlite',
        LP_MINE_SWAP_WINDOW_SECONDS: '3600',
        LP_MINE_SWAP_EVIDENCE_LIMIT: '500',
      }),
    ).toEqual({
      databasePath: '/tmp/swaps.sqlite',
      windowSeconds: 3_600,
      limitPerPool: 500,
    })
  })

  it('rejects invalid values', () => {
    expect(() => readSwapEvidenceReportConfig({ LP_MINE_SWAP_WINDOW_SECONDS: '0' })).toThrow(/between/)
    expect(() => readSwapEvidenceReportConfig({ LP_MINE_SWAP_EVIDENCE_LIMIT: 'many' })).toThrow(/unsigned/)
  })
})
