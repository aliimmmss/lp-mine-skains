import type { CheckpointStore, IndexCheckpoint } from './indexer.js'
import type { IndexedSwap, SwapEventSink, SwapEventSource } from './swap-indexer.js'

export type BackfillOptions = {
  startBlock: bigint
  /** Blocks kept behind the head so every indexed block is deeply finalized. */
  safetyLag?: bigint
  /** Blocks fetched per eth_getLogs range query. */
  maxBlockSpan?: bigint
}

export type BackfillResult = {
  processedFrom: bigint | null
  processedTo: bigint | null
  eventsWritten: number
  checkpoint: IndexCheckpoint
}

/**
 * Historical swap backfill for deeply finalized ranges.
 *
 * Unlike syncSwapEvents, this fetches logs one span at a time instead of one
 * block at a time, and fetches headers only for swap-bearing blocks. Reorg
 * hash-chain walking is unnecessary because the end of the indexed range is
 * pinned safetyLag blocks behind the head. Each swap log's block hash is
 * verified against the canonical header before storage and mismatches fail
 * closed.
 */
export async function backfillSwapEvents(args: {
  source: SwapEventSource
  checkpoints: CheckpointStore
  sink: SwapEventSink
  options: BackfillOptions
  onProgress?: (progress: { nextBlock: bigint; endBlock: bigint; eventsWritten: number }) => void
}): Promise<BackfillResult> {
  const safetyLag = args.options.safetyLag ?? 10_000n
  const maxBlockSpan = args.options.maxBlockSpan ?? 10_000n
  if (safetyLag < 0n) throw new Error('safetyLag must be non-negative')
  if (maxBlockSpan <= 0n) throw new Error('maxBlockSpan must be positive')

  const checkpoint = (await args.checkpoints.load()) ?? { nextBlock: args.options.startBlock }
  let nextBlock = checkpoint.nextBlock

  const head = await args.source.getHeadBlockNumber()
  const endBlock = head - safetyLag
  if (endBlock < nextBlock) {
    return { processedFrom: null, processedTo: null, eventsWritten: 0, checkpoint }
  }

  const processedFrom = nextBlock
  let eventsWritten = 0

  while (nextBlock <= endBlock) {
    const spanEnd = minBigInt(endBlock, nextBlock + maxBlockSpan - 1n)
    const events = await args.source.getSwapEvents(nextBlock, spanEnd)

    const byBlock = new Map<bigint, IndexedSwap[]>()
    for (const event of events) {
      const existing = byBlock.get(event.blockNumber)
      if (existing) {
        byBlock.set(event.blockNumber, [...existing, event])
      } else {
        byBlock.set(event.blockNumber, [event])
      }
    }

    for (const [blockNumber, blockEvents] of byBlock) {
      const header = await args.source.getBlockHeader(blockNumber)
      for (const event of blockEvents) {
        if (event.blockHash !== header.hash) {
          throw new Error(
            `Swap log block hash mismatch at block ${blockNumber}: log ${event.blockHash} vs header ${header.hash}`,
          )
        }
      }
      await args.sink.replaceBlock(header, blockEvents)
      eventsWritten += blockEvents.length
    }

    nextBlock = spanEnd + 1n
    await args.checkpoints.save({ nextBlock })
    args.onProgress?.({ nextBlock, endBlock, eventsWritten })
  }

  return {
    processedFrom,
    processedTo: endBlock,
    eventsWritten,
    checkpoint: { nextBlock },
  }
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right
}
