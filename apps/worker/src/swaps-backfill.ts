import {
  ROBINHOOD_WETH_USDG_POOLS,
  SqliteSwapIndexStore,
  backfillSwapEvents,
  createRobinhoodPublicClient,
  createViemSwapEventSource,
} from '@lp-mine/robinhood-univ3'
import { pathToFileURL } from 'node:url'
import { ensureDatabaseParentDirectory } from './database-path.js'
import { readSwapScanConfig, type SwapScanConfig } from './swaps-scan-config.js'

function readSafetyLag(environment: NodeJS.ProcessEnv = process.env): bigint {
  const raw = environment.LP_MINE_SWAP_SAFETY_LAG
  if (!raw) return 10_000n
  if (!/^\d+$/.test(raw)) throw new Error('LP_MINE_SWAP_SAFETY_LAG must be an unsigned integer')
  return BigInt(raw)
}

export async function runSwapBackfill(config: SwapScanConfig, safetyLag: bigint): Promise<void> {
  ensureDatabaseParentDirectory(config.databasePath)
  const publicClient = createRobinhoodPublicClient(config.rpcUrl ? { rpcUrl: config.rpcUrl } : {})
  const source = createViemSwapEventSource(
    publicClient,
    ROBINHOOD_WETH_USDG_POOLS.map((pool) => pool.poolAddress),
  )
  const store = new SqliteSwapIndexStore(config.databasePath)

  try {
    const result = await backfillSwapEvents({
      source,
      checkpoints: store,
      sink: store,
      options: {
        startBlock: config.startBlock,
        safetyLag,
        maxBlockSpan: config.maxBlockSpan,
      },
      onProgress: ({ nextBlock, endBlock, eventsWritten }) => {
        process.stderr.write(`backfill progress: next=${nextBlock} end=${endBlock} swaps=${eventsWritten}\n`)
      },
    })

    process.stdout.write(
      `${JSON.stringify({
        mode: 'read-only',
        processedFrom: result.processedFrom?.toString() ?? null,
        processedTo: result.processedTo?.toString() ?? null,
        swapsWritten: result.eventsWritten,
        nextBlock: result.checkpoint.nextBlock.toString(),
        totalSwapsStored: store.countSwaps(),
        pools: ROBINHOOD_WETH_USDG_POOLS.map((pool) => ({
          feeTier: pool.feeTier,
          poolAddress: pool.poolAddress,
          swapsStored: store.countSwaps(pool.poolAddress),
        })),
        databasePath: config.databasePath,
      })}\n`,
    )
  } finally {
    store.close()
  }
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  runSwapBackfill(readSwapScanConfig(), readSafetyLag()).catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
