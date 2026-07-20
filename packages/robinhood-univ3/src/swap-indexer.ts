import type { Address, Hex } from 'viem'
import type { BlockHeader, CheckpointStore, IndexCheckpoint, SyncOptions, SyncResult } from './indexer.js'

export type IndexedSwap = {
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
}

export interface SwapEventSource {
  getHeadBlockNumber(): Promise<bigint>
  getBlockHeader(blockNumber: bigint): Promise<BlockHeader>
  getSwapEvents(fromBlock: bigint, toBlock: bigint): Promise<readonly IndexedSwap[]>
}

export interface SwapEventSink {
  replaceBlock(block: BlockHeader, events: readonly IndexedSwap[]): Promise<void>
  deleteFromBlock(blockNumber: bigint): Promise<void>
}

export async function syncSwapEvents(args: {
  source: SwapEventSource
  checkpoints: CheckpointStore
  sink: SwapEventSink
  options: SyncOptions
}): Promise<SyncResult> {
  const confirmationDepth = args.options.confirmationDepth ?? 12n
  const maxBlockSpan = args.options.maxBlockSpan ?? 2_000n
  if (confirmationDepth < 0n || maxBlockSpan <= 0n) throw new Error('Invalid swap indexer options')

  let checkpoint: IndexCheckpoint = (await args.checkpoints.load()) ?? { nextBlock: args.options.startBlock }
  let rewoundFrom: bigint | null = null

  if (checkpoint.lastProcessedBlock) {
    const canonical = await args.source.getBlockHeader(checkpoint.lastProcessedBlock.number)
    if (canonical.hash !== checkpoint.lastProcessedBlock.hash) {
      rewoundFrom = checkpoint.lastProcessedBlock.number
      await args.sink.deleteFromBlock(rewoundFrom)
      checkpoint = { nextBlock: rewoundFrom }
      await args.checkpoints.save(checkpoint)
    }
  }

  const head = await args.source.getHeadBlockNumber()
  if (head < confirmationDepth) return emptyResult(checkpoint, rewoundFrom)
  const confirmedHead = head - confirmationDepth
  if (checkpoint.nextBlock > confirmedHead) return emptyResult(checkpoint, rewoundFrom)

  const fromBlock = checkpoint.nextBlock
  const toBlock = minBigInt(confirmedHead, fromBlock + maxBlockSpan - 1n)
  let eventsWritten = 0

  for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber += 1n) {
    const header = await args.source.getBlockHeader(blockNumber)
    if (checkpoint.lastProcessedBlock && header.parentHash !== checkpoint.lastProcessedBlock.hash) {
      rewoundFrom = checkpoint.lastProcessedBlock.number
      await args.sink.deleteFromBlock(rewoundFrom)
      checkpoint = { nextBlock: rewoundFrom }
      await args.checkpoints.save(checkpoint)
      return {
        processedFrom: null,
        processedTo: null,
        eventsWritten: 0,
        rewoundFrom,
        checkpoint,
      }
    }

    const events = await args.source.getSwapEvents(blockNumber, blockNumber)
    await args.sink.replaceBlock(header, events)
    eventsWritten += events.length
    checkpoint = { nextBlock: blockNumber + 1n, lastProcessedBlock: header }
    await args.checkpoints.save(checkpoint)
  }

  return { processedFrom: fromBlock, processedTo: toBlock, eventsWritten, rewoundFrom, checkpoint }
}

function emptyResult(checkpoint: IndexCheckpoint, rewoundFrom: bigint | null): SyncResult {
  return {
    processedFrom: null,
    processedTo: null,
    eventsWritten: 0,
    rewoundFrom,
    checkpoint,
  }
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right
}
