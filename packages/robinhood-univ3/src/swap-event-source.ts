import { classifyCanonicalSwap } from '@lp-mine/core'
import { getAddress, parseAbiItem, type Address, type Hex, type PublicClient } from 'viem'
import type { BlockHeader } from './indexer.js'
import type { IndexedSwap, SwapEventSource } from './swap-indexer.js'

const swapEvent = parseAbiItem(
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
)

export function createViemSwapEventSource(
  publicClient: PublicClient,
  poolAddresses: readonly Address[],
): SwapEventSource {
  if (poolAddresses.length === 0) throw new RangeError('At least one pool address is required')
  const addresses = poolAddresses.map(getAddress)

  return {
    async getHeadBlockNumber() {
      return publicClient.getBlockNumber()
    },

    async getBlockHeader(blockNumber): Promise<BlockHeader> {
      const block = await publicClient.getBlock({ blockNumber })
      if (!block.hash) throw new Error(`Block ${blockNumber} has no hash`)
      const observedAt = new Date(Number(block.timestamp) * 1_000)
      if (Number.isNaN(observedAt.getTime())) throw new Error(`Block ${blockNumber} has an invalid timestamp`)
      return { number: block.number, hash: block.hash, parentHash: block.parentHash, observedAt }
    },

    async getSwapEvents(fromBlock, toBlock): Promise<readonly IndexedSwap[]> {
      const logs = await publicClient.getLogs({
        address: addresses,
        event: swapEvent,
        fromBlock,
        toBlock,
        strict: true,
      })

      return logs.map((log) => {
        const { sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick } = log.args
        if (
          sender === undefined ||
          recipient === undefined ||
          amount0 === undefined ||
          amount1 === undefined ||
          sqrtPriceX96 === undefined ||
          liquidity === undefined ||
          tick === undefined ||
          log.blockNumber === null ||
          log.blockHash === null ||
          log.transactionHash === null ||
          log.logIndex === null
        ) {
          throw new Error('Swap log is missing required canonical fields')
        }

        return normalizeSwapLog({
          poolAddress: log.address,
          sender,
          recipient,
          amount0,
          amount1,
          sqrtPriceX96,
          activeLiquidity: liquidity,
          tick,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
        })
      })
    },
  }
}

export function normalizeSwapLog(log: {
  poolAddress: Address
  sender: Address
  recipient: Address
  amount0: bigint
  amount1: bigint
  sqrtPriceX96: bigint
  activeLiquidity: bigint
  tick: number
  blockNumber: bigint
  blockHash: Hex
  transactionHash: Hex
  logIndex: number
}): IndexedSwap {
  if (log.sqrtPriceX96 <= 0n || log.activeLiquidity < 0n || log.logIndex < 0) {
    throw new Error('Swap log contains invalid numeric fields')
  }
  classifyCanonicalSwap(log.amount0, log.amount1)

  return {
    poolAddress: getAddress(log.poolAddress),
    sender: getAddress(log.sender),
    recipient: getAddress(log.recipient),
    amount0: log.amount0,
    amount1: log.amount1,
    sqrtPriceX96: log.sqrtPriceX96,
    activeLiquidity: log.activeLiquidity,
    tick: log.tick,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  }
}
