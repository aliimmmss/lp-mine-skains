import {
  getAddress,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import type {
  BlockHeader,
  IndexedPoolCreated,
  PoolCreatedEventSource,
} from './indexer.js'
import { ROBINHOOD_UNISWAP_V3 } from './registry.js'

const poolCreatedEvent = parseAbiItem(
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
)

export function createViemPoolCreatedEventSource(
  publicClient: PublicClient,
): PoolCreatedEventSource {
  return {
    async getHeadBlockNumber() {
      return publicClient.getBlockNumber()
    },

    async getBlockHeader(blockNumber): Promise<BlockHeader> {
      const block = await publicClient.getBlock({ blockNumber })
      if (!block.hash) {
        throw new Error(`Block ${blockNumber} has no hash`)
      }

      return {
        number: block.number,
        hash: block.hash,
        parentHash: block.parentHash,
      }
    },

    async getPoolCreatedEvents(fromBlock, toBlock): Promise<readonly IndexedPoolCreated[]> {
      const logs = await publicClient.getLogs({
        address: ROBINHOOD_UNISWAP_V3.factory,
        event: poolCreatedEvent,
        fromBlock,
        toBlock,
        strict: true,
      })

      return logs.map((log) => {
        const { token0, token1, fee, tickSpacing, pool } = log.args
        if (
          token0 === undefined ||
          token1 === undefined ||
          fee === undefined ||
          tickSpacing === undefined ||
          pool === undefined ||
          log.blockNumber === null ||
          log.blockHash === null ||
          log.transactionHash === null ||
          log.logIndex === null
        ) {
          throw new Error('PoolCreated log is missing required canonical fields')
        }

        return normalizePoolCreatedLog({
          poolAddress: pool,
          token0,
          token1,
          feeTier: fee,
          tickSpacing,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
        })
      })
    },
  }
}

export function normalizePoolCreatedLog(log: {
  poolAddress: Address
  token0: Address
  token1: Address
  feeTier: number
  tickSpacing: number
  blockNumber: bigint
  blockHash: Hex
  transactionHash: Hex
  logIndex: number
}): IndexedPoolCreated {
  if (log.feeTier <= 0 || log.tickSpacing <= 0 || log.logIndex < 0) {
    throw new Error('PoolCreated log contains invalid numeric fields')
  }

  return {
    poolAddress: getAddress(log.poolAddress),
    token0: getAddress(log.token0),
    token1: getAddress(log.token1),
    feeTier: log.feeTier,
    tickSpacing: log.tickSpacing,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  }
}
