import { describe, expect, it } from 'vitest'
import { readPoolObserveConfig } from './pools-observe-config.js'

describe('readPoolObserveConfig', () => {
  it('uses the shared default database and omits an unset RPC URL', () => {
    expect(readPoolObserveConfig({})).toEqual({ databasePath: './data/robinhood-univ3.sqlite' })
  })

  it('accepts configured database and RPC values', () => {
    expect(
      readPoolObserveConfig({
        LP_MINE_DATABASE_PATH: '/tmp/pools.sqlite',
        ROBINHOOD_RPC_URL: 'https://example.invalid/rpc',
      }),
    ).toEqual({ databasePath: '/tmp/pools.sqlite', rpcUrl: 'https://example.invalid/rpc' })
  })
})
