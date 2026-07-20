import { describe, expect, it } from 'vitest'
import { getAddress, zeroAddress, type Address } from 'viem'
import { PoolVerificationError, readVerifiedPoolSnapshot, type PoolState, type UniswapV3ReadClient } from './index.js'

const pool = getAddress('0x1111111111111111111111111111111111111111')
const token0 = getAddress('0x2222222222222222222222222222222222222222')
const token1 = getAddress('0x3333333333333333333333333333333333333333')

function client(factoryPool: Address = pool): UniswapV3ReadClient {
  const state: PoolState = {
    sqrtPriceX96: 79_228_162_514_264_337_593_543_950_336n,
    tick: 0,
    tickSpacing: 60,
    activeLiquidity: 1_000_000n,
  }

  return {
    async getPool() {
      return factoryPool
    },
    async readPoolState() {
      return state
    },
    async readToken(address) {
      return address === token0 ? { symbol: 'WETH', decimals: 18 } : { symbol: 'USDC', decimals: 6 }
    },
    async getBlock() {
      return { blockNumber: 123_456n, timestamp: 1_721_000_000n }
    },
  }
}

describe('readVerifiedPoolSnapshot', () => {
  it('returns a source-stamped snapshot for an official pool', async () => {
    const snapshot = await readVerifiedPoolSnapshot({
      client: client(),
      poolAddress: pool,
      token0,
      token1,
      feeTier: 3000,
    })

    expect(snapshot.quality).toBe('complete')
    expect(snapshot.value.poolAddress).toBe(pool)
    expect(snapshot.value.token0.symbol).toBe('WETH')
    expect(snapshot.value.token1.decimals).toBe(6)
    expect(snapshot.block.blockNumber).toBe(123_456n)
  })

  it('rejects an address not returned by the official factory', async () => {
    await expect(
      readVerifiedPoolSnapshot({
        client: client(zeroAddress),
        poolAddress: pool,
        token0,
        token1,
        feeTier: 3000,
      }),
    ).rejects.toBeInstanceOf(PoolVerificationError)
  })

  it('rejects unsupported fee tiers', async () => {
    await expect(
      readVerifiedPoolSnapshot({
        client: client(),
        poolAddress: pool,
        token0,
        token1,
        feeTier: 2500,
      }),
    ).rejects.toThrow('Unsupported fee tier')
  })
})
