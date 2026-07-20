import type { Address, Hex } from 'viem'

export type IndexedPoolCreated = {
  poolAddress: Address
  token0: Address
  token1: Address
  feeTier: number
  tickSpacing: number
  blockNumber: bigint
  blockHash: Hex
  transactionHash: Hex
  logIndex: number
}

export type BlockHeader = {
  number: bigint
  hash: Hex
  parentHash: Hex
}

export type IndexCheckpoint = {
  nextBlock: bigint
  lastProcessedBlock?: BlockHeader
}

export interface PoolCreatedEventSource {
  getHeadBlockNumber(): Promise<bigint>
  getBlockHeader(blockNumber: bigint): Promise<BlockHeader>
  getPoolCreatedEvents(fromBlock: bigint, toBlock: bigint): Promise<readonly IndexedPoolCreated[]>
}

export interface CheckpointStore {
  load(): Promise<IndexCheckpoint | null>
  save(checkpoint: IndexCheckpoint): Promise<void>
}

export interface PoolEventSink {
  replaceBlock(block: BlockHeader, events: readonly IndexedPoolCreated[]): Promise<void>
  deleteFromBlock(blockNumber: bigint): Promise<void>
}

export type SyncOptions = {
  startBlock: bigint
  confirmationDepth?: bigint
  maxBlockSpan?: bigint
}

export type SyncResult = {
  processedFrom: bigint | null
  processedTo: bigint | null
  eventsWritten: number
  rewoundFrom: bigint | null
  checkpoint: IndexCheckpoint
}

export async function syncPoolCreatedEvents(args: {
  source: PoolCreatedEventSource
  checkpoints: CheckpointStore
  sink: PoolEventSink
  options: SyncOptions
}): Promise<SyncResult> {
  const confirmationDepth = args.options.confirmationDepth ?? 12n
  const maxBlockSpan = args.options.maxBlockSpan ?? 2_000n
  if (confirmationDepth < 0n || maxBlockSpan <= 0n) {
    throw new Error('Invalid indexer options')
  }

  let checkpoint = (await args.checkpoints.load()) ?? { nextBlock: args.options.startBlock }
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
  if (head < confirmationDepth) {
    return emptyResult(checkpoint, rewoundFrom)
  }

  const confirmedHead = head - confirmationDepth
  if (checkpoint.nextBlock > confirmedHead) {
    return emptyResult(checkpoint, rewoundFrom)
  }

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

    const events = await args.source.getPoolCreatedEvents(blockNumber, blockNumber)
    await args.sink.replaceBlock(header, events)
    eventsWritten += events.length
    checkpoint = {
      nextBlock: blockNumber + 1n,
      lastProcessedBlock: header,
    }
    await args.checkpoints.save(checkpoint)
  }

  return {
    processedFrom: fromBlock,
    processedTo: toBlock,
    eventsWritten,
    rewoundFrom,
    checkpoint,
  }
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

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}
