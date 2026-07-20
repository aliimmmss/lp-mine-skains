import {
  ROBINHOOD_WETH_USDG_POOLS,
  SqliteSwapIndexStore,
  createRobinhoodPublicClient,
  createViemSwapEventSource,
  syncSwapEvents,
} from '@lp-mine/robinhood-univ3'
import { pathToFileURL } from 'node:url'
import { ensureDatabaseParentDirectory } from './database-path.js'
import { readSwapScanConfig, type SwapScanConfig } from './swaps-scan-config.js'

export async function runSwapScan(config: SwapScanConfig): Promise<void> {
  ensureDatabaseParentDirectory(config.databasePath)
  const publicClient = createRobinhoodPublicClient(config.rpcUrl ? { rpcUrl: config.rpcUrl } : {})
  const source = createViemSwapEventSource(
    publicClient,
    ROBINHOOD_WETH_USDG_POOLS.map((pool) => pool.poolAddress),
  )
  const store = new SqliteSwapIndexStore(config.databasePath)

  try {
    const result = await syncSwapEvents({
      source,
      checkpoints: store,
      sink: store,
      options: {
        startBlock: config.startBlock,
        confirmationDepth: config.confirmationDepth,
        maxBlockSpan: config.maxBlockSpan,
      },
    })

    process.stdout.write(
      `${JSON.stringify({
        mode: 'read-only',
        processedFrom: result.processedFrom?.toString() ?? null,
        processedTo: result.processedTo?.toString() ?? null,
        swapsWritten: result.eventsWritten,
        rewoundFrom: result.rewoundFrom?.toString() ?? null,
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
  runSwapScan(readSwapScanConfig()).catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
