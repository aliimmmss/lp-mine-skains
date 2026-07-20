import { describe, expect, it } from 'vitest'
import { readPoolScanConfig } from './pools-scan-config.js'

describe('readPoolScanConfig', () => {
  it('requires an explicit start block', () => {
    expect(() => readPoolScanConfig({})).toThrow('LP_MINE_START_BLOCK is required')
  })

  it('applies safe read-only defaults', () => {
    expect(readPoolScanConfig({ LP_MINE_START_BLOCK: '123' })).toEqual({
      startBlock: 123n,
      confirmationDepth: 12n,
      maxBlockSpan: 2_000n,
      databasePath: './data/robinhood-univ3.sqlite',
    })
  })

  it('accepts explicit RPC and persistence settings', () => {
    expect(
      readPoolScanConfig({
        LP_MINE_START_BLOCK: '123',
        LP_MINE_CONFIRMATION_DEPTH: '20',
        LP_MINE_MAX_BLOCK_SPAN: '500',
        LP_MINE_DATABASE_PATH: '/tmp/pools.sqlite',
        ROBINHOOD_RPC_URL: 'https://rpc.example',
      }),
    ).toEqual({
      startBlock: 123n,
      confirmationDepth: 20n,
      maxBlockSpan: 500n,
      databasePath: '/tmp/pools.sqlite',
      rpcUrl: 'https://rpc.example',
    })
  })

  it('rejects malformed numeric settings', () => {
    expect(() => readPoolScanConfig({ LP_MINE_START_BLOCK: '123.5' })).toThrow(
      'LP_MINE_START_BLOCK must be an unsigned integer',
    )
  })
})
