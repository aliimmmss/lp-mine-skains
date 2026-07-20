import {
  SqlitePoolIndexStore,
  createRobinhoodPublicClient,
  createViemPoolCreatedEventSource,
  syncPoolCreatedEvents,
} from '@lp-mine/robinhood-univ3'
import { pathToFileURL } from 'node:url'

export type PoolScanConfig = {
  startBlock: bigint
  confirmationDepth: bigint
  maxBlockSpan: bigint
  databasePath: string
  rpcUrl?: string
}

export function readPoolScanConfig(environment: NodeJS.ProcessEnv = process.env): PoolScanConfig {
  const startBlock = parseRequiredBigInt(environment.LP_MINE_START_BLOCK, 'LP_MINE_START_BLOCK')
  const confirmationDepth = parseOptionalBigInt(environment.LP_MINE_CONFIRMATION_DEPTH, 12n, 'LP_MINE_CONFIRMATION_DEPTH')
  const maxBlockSpan = parseOptionalBigInt(environment.LP_MINE_MAX_BLOCK_SPAN, 2_000n, 'LP_MINE_MAX_BLOCK_SPAN')

  if (confirmationDepth < 0n) throw new Error('LP_MINE_CONFIRMATION_DEPTH must be non-negative')
  if (maxBlockSpan <= 0n) throw new Error('LP_MINE_MAX_BLOCK_SPAN must be positive')

  return {
    startBlock,
    confirmationDepth,
    maxBlockSpan,
    databasePath: environment.LP_MINE_DATABASE_PATH ?? './data/robinhood-univ3.sqlite',
    ...(environment.ROBINHOOD_RPC_URL ? { rpcUrl: environment.ROBINHOOD_RPC_URL } : {}),
  }
}

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

function parseRequiredBigInt(value: string | undefined, name: string): bigint {
  if (!value) throw new Error(`${name} is required`)
  return parseBigInt(value, name)
}

function parseOptionalBigInt(value: string | undefined, fallback: bigint, name: string): bigint {
  return value ? parseBigInt(value, name) : fallback
}

function parseBigInt(value: string, name: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an unsigned integer`)
  return BigInt(value)
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  runPoolScan(readPoolScanConfig()).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
