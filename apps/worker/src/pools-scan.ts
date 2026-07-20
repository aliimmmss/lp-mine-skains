import {
  SqlitePoolIndexStore,
  createRobinhoodPublicClient,
  createViemPoolCreatedEventSource,
  syncPoolCreatedEvents,
} from '@lp-mine/robinhood-univ3'
import { pathToFileURL } from 'node:url'
import { readPoolScanConfig, type PoolScanConfig } from './pools-scan-config.js'

export { readPoolScanConfig } from './pools-scan-config.js'
export type { PoolScanConfig } from './pools-scan-config.js'

export async function runPoolScan(config: PoolScanConfig): Promise<void> {
  const publicClient = createRobinhoodPublicClient(config.rpcUrl ? { rpcUrl: config.rpcUrl } : {})
  const source = createViemPoolCreatedEventSource(publicClient)
  const store = new SqlitePoolIndexStore(config.databasePath)

  try {
    const result = await syncPoolCreatedEvents({
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
        eventsWritten: result.eventsWritten,
        rewoundFrom: result.rewoundFrom?.toString() ?? null,
        nextBlock: result.checkpoint.nextBlock.toString(),
        poolsIndexed: store.listPools().length,
        databasePath: config.databasePath,
      })}\n`,
    )
  } finally {
    store.close()
  }
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  runPoolScan(readPoolScanConfig()).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
