import type { TokenRef } from '@lp-mine/core'
import { createPublicClient, defineChain, getAddress, http, parseAbi, type Address, type PublicClient } from 'viem'
import type { PoolState, UniswapV3ReadClient } from './index.js'
import { ROBINHOOD_UNISWAP_V3 } from './registry.js'

const factoryAbi = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
])

const poolAbi = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function tickSpacing() view returns (int24)',
  'function liquidity() view returns (uint128)',
])

const tokenAbi = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)'])

export const robinhoodChain = defineChain({
  id: ROBINHOOD_UNISWAP_V3.chainId,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ROBINHOOD_UNISWAP_V3.publicRpcUrl] },
  },
})

export type LiveClientOptions = {
  rpcUrl?: string
  retryCount?: number
  retryDelayMs?: number
}

export function createRobinhoodPublicClient(options: LiveClientOptions = {}): PublicClient {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(options.rpcUrl ?? ROBINHOOD_UNISWAP_V3.publicRpcUrl, {
      retryCount: options.retryCount ?? 3,
      retryDelay: options.retryDelayMs ?? 500,
      timeout: 15_000,
    }),
  })
}

export function createViemReadClient(publicClient: PublicClient): UniswapV3ReadClient {
  return {
    async getPool(tokenA, tokenB, feeTier) {
      return getAddress(
        await publicClient.readContract({
          address: ROBINHOOD_UNISWAP_V3.factory,
          abi: factoryAbi,
          functionName: 'getPool',
          args: [tokenA, tokenB, feeTier],
        }),
      )
    },

    async readPoolState(poolAddress): Promise<PoolState> {
      const [slot0, tickSpacing, activeLiquidity] = await Promise.all([
        publicClient.readContract({
          address: poolAddress,
          abi: poolAbi,
          functionName: 'slot0',
        }),
        publicClient.readContract({
          address: poolAddress,
          abi: poolAbi,
          functionName: 'tickSpacing',
        }),
        publicClient.readContract({
          address: poolAddress,
          abi: poolAbi,
          functionName: 'liquidity',
        }),
      ])

      return {
        sqrtPriceX96: slot0[0],
        tick: slot0[1],
        tickSpacing,
        activeLiquidity,
      }
    },

    async readToken(tokenAddress): Promise<Pick<TokenRef, 'symbol' | 'decimals'>> {
      const [symbol, decimals] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: 'symbol',
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: 'decimals',
        }),
      ])

      return { symbol, decimals }
    },

    async getBlock() {
      const block = await publicClient.getBlock()
      return {
        blockNumber: block.number,
        timestamp: block.timestamp,
      }
    },
  }
}

export type PoolCreatedLog = {
  poolAddress: Address
  token0: Address
  token1: Address
  feeTier: number
  tickSpacing: number
  blockNumber: bigint
  blockHash: `0x${string}`
  transactionHash: `0x${string}`
  logIndex: number
}
