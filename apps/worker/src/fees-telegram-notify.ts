import { pathToFileURL } from 'node:url'
import { readMonitorTelegramDestination, sendTelegramMessage } from './monitor-telegram-notify.js'
import { buildPoolFeeReport, type PoolFeeEntry, type PoolFeeReport } from './pools-fees.js'

const DEFAULT_WINDOW_SECONDS = 86_400
const DEFAULT_REFERENCE_LIQUIDITY = 10n ** 18n

function formatFeePercent(feeTier: number): string {
  return `${feeTier / 10_000}%`
}

function formatPoolLine(entry: PoolFeeEntry): string {
  const tier = formatFeePercent(entry.feeTier)
  if (entry.status === 'insufficient' || entry.dailyFeesCombinedInToken1Decimal === null) {
    return `${tier}: ${entry.status} (need more observations)`
  }
  const occupancy = entry.occupancy?.bands
    .map((band) => `${band.label} ${band.occupancyDecimal}`)
    .join(', ')
  const status = entry.status === 'partial' ? ' [partial]' : ''
  return (
    `${tier}: ${entry.dailyFeesCombinedInToken1Decimal} token1/day per ${entry.referenceLiquidity} L${status}` +
    (occupancy ? `\n   in-range: ${occupancy}` : '')
  )
}

export function formatFeeDigestMessage(report: PoolFeeReport): string {
  const lines = [
    'LP Mine fee digest',
    `Generated: ${report.generatedAt.toISOString()}`,
    `Window: ${report.configuredWindowSeconds}s · pair WETH/USDG`,
    '',
    'Fee tiers ranked by combined daily fees per unit liquidity:',
  ]
  for (const entry of report.pools) lines.push(formatPoolLine(entry))
  lines.push(
    '',
    'in-range = fraction of recent observations within that price band around the current tick (backward-looking).',
    'Estimate of past fees while in range, not a guaranteed APR or a recommendation to deploy capital.',
  )
  return lines.join('\n')
}

export async function runFeeDigestTelegramCommand(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const destination = readMonitorTelegramDestination(environment)
  const report = buildPoolFeeReport({
    databasePath: environment.LP_MINE_DATABASE_PATH ?? './data/robinhood-univ3.sqlite',
    windowSeconds: DEFAULT_WINDOW_SECONDS,
    referenceLiquidity: DEFAULT_REFERENCE_LIQUIDITY,
    limit: 10_000,
  })
  const message = formatFeeDigestMessage(report)
  const result = await sendTelegramMessage(destination, message)
  process.stdout.write(`${JSON.stringify({ mode: 'read-only', messageId: result.messageId }, null, 2)}\n`)
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  runFeeDigestTelegramCommand().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
