import { pathToFileURL } from 'node:url'
import { SqliteMonitorAlertStateStore, type MonitorAlertState } from './monitor-alert-state.js'
import { readMonitorHealthConfig } from './monitor-health-config.js'
import { buildMonitorHealthReport, type MonitorHealthStatus } from './monitor-health.js'

const TELEGRAM_CHANNEL = 'telegram'
const TELEGRAM_MESSAGE_LIMIT = 3_900

export type MonitorTelegramDestination = {
  botToken: string
  chatId: string
  messageThreadId: number | null
}

export type MonitorTelegramNotificationStatus = 'sent' | 'no-op'

export type MonitorTelegramNotificationReport = {
  mode: 'read-only'
  generatedAt: Date
  status: MonitorTelegramNotificationStatus
  healthStatus: MonitorHealthStatus
  candidateAlertCount: number
  deliveredAlertCount: number
  messageCount: number
  disclaimer: string
}

export type TelegramAlertBatch = {
  alerts: readonly MonitorAlertState[]
  text: string
}

export type TelegramSender = (destination: MonitorTelegramDestination, text: string) => Promise<{ messageId: string }>

export function readMonitorTelegramDestination(
  environment: NodeJS.ProcessEnv = process.env,
): MonitorTelegramDestination {
  const botToken = readRequiredValue(
    environment.LP_MINE_TELEGRAM_BOT_TOKEN ?? environment.TELEGRAM_BOT_TOKEN,
    'LP_MINE_TELEGRAM_BOT_TOKEN',
  )
  const chatId = readRequiredValue(
    environment.LP_MINE_TELEGRAM_CHAT_ID ?? environment.TELEGRAM_CHAT_ID,
    'LP_MINE_TELEGRAM_CHAT_ID',
  )
  const threadValue = environment.LP_MINE_TELEGRAM_MESSAGE_THREAD_ID ?? environment.TELEGRAM_MESSAGE_THREAD_ID
  return {
    botToken,
    chatId,
    messageThreadId:
      threadValue === undefined || threadValue.trim().length === 0
        ? null
        : parsePositiveInteger(threadValue, 'LP_MINE_TELEGRAM_MESSAGE_THREAD_ID'),
  }
}

export function buildTelegramAlertBatches(
  alerts: readonly MonitorAlertState[],
  healthStatus: MonitorHealthStatus,
  generatedAt: Date,
): readonly TelegramAlertBatch[] {
  if (alerts.length === 0) return []
  const batches: TelegramAlertBatch[] = []
  let current: MonitorAlertState[] = []

  for (const alert of alerts) {
    const candidate = [...current, alert]
    const text = formatTelegramAlertMessage(candidate, healthStatus, generatedAt)
    if (text.length <= TELEGRAM_MESSAGE_LIMIT || current.length === 0) {
      current = candidate
      continue
    }
    batches.push({
      alerts: current,
      text: truncate(formatTelegramAlertMessage(current, healthStatus, generatedAt), TELEGRAM_MESSAGE_LIMIT),
    })
    current = [alert]
  }

  if (current.length > 0) {
    batches.push({
      alerts: current,
      text: truncate(formatTelegramAlertMessage(current, healthStatus, generatedAt), TELEGRAM_MESSAGE_LIMIT),
    })
  }
  return batches
}

export async function deliverPendingTelegramAlerts(
  store: SqliteMonitorAlertStateStore,
  destination: MonitorTelegramDestination,
  healthStatus: MonitorHealthStatus,
  generatedAt = new Date(),
  sender: TelegramSender = sendTelegramMessage,
): Promise<MonitorTelegramNotificationReport> {
  const pendingAlerts = store.listPendingNotificationAlerts(TELEGRAM_CHANNEL)
  const batches = buildTelegramAlertBatches(pendingAlerts, healthStatus, generatedAt)
  let deliveredAlertCount = 0

  for (const batch of batches) {
    const result = await sender(destination, batch.text)
    for (const alert of batch.alerts) {
      if (store.recordNotificationDelivery(TELEGRAM_CHANNEL, alert, generatedAt, result.messageId)) {
        deliveredAlertCount += 1
      }
    }
  }

  return {
    mode: 'read-only',
    generatedAt,
    status: batches.length === 0 ? 'no-op' : 'sent',
    healthStatus,
    candidateAlertCount: pendingAlerts.length,
    deliveredAlertCount,
    messageCount: batches.length,
    disclaimer:
      'Telegram delivery reports deterministic monitoring alerts only. It cannot sign transactions, move funds, or recommend deploying capital.',
  }
}

export async function sendTelegramMessage(
  destination: MonitorTelegramDestination,
  text: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<{ messageId: string }> {
  if (text.trim().length === 0) throw new RangeError('Telegram message text must not be empty')
  const request: {
    chat_id: string
    text: string
    protect_content: true
    message_thread_id?: number
  } = {
    chat_id: destination.chatId,
    text,
    protect_content: true,
  }
  if (destination.messageThreadId !== null) {
    request.message_thread_id = destination.messageThreadId
  }

  let response: Response
  try {
    response = await fetchImplementation(`https://api.telegram.org/bot${destination.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error('Telegram sendMessage request failed before receiving a response')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(`Telegram sendMessage returned an unreadable response (${response.status})`)
  }

  if (!response.ok || !isTelegramSuccessPayload(payload)) {
    const description =
      isRecord(payload) && typeof payload.description === 'string'
        ? truncate(payload.description, 300)
        : 'unknown Telegram API error'
    throw new Error(`Telegram sendMessage failed (${response.status}): ${description}`)
  }

  return { messageId: String(payload.result.message_id) }
}

export async function runMonitorTelegramNotifyCommand(
  environment: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<void> {
  const healthConfig = readMonitorHealthConfig(environment)
  const destination = readMonitorTelegramDestination(environment)
  const health = buildMonitorHealthReport(healthConfig, now)
  const store = new SqliteMonitorAlertStateStore(healthConfig.databasePath)
  try {
    store.reconcile(health.alerts, now)
    const result = await deliverPendingTelegramAlerts(store, destination, health.status, now)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    store.close()
  }
}

function formatTelegramAlertMessage(
  alerts: readonly MonitorAlertState[],
  healthStatus: MonitorHealthStatus,
  generatedAt: Date,
): string {
  const lines = [
    'LP Mine monitoring alert',
    `Health status: ${healthStatus.toUpperCase()}`,
    `Generated: ${generatedAt.toISOString()}`,
    `New unacknowledged alerts: ${alerts.length}`,
    '',
  ]
  alerts.forEach((alert, index) => {
    lines.push(
      `${index + 1}. ${alert.severity.toUpperCase()} · ${alert.code}`,
      `Fee tier: ${alert.feeTier} (${formatFeePercent(alert.feeTier)})`,
      `Pool: ${alert.poolAddress}`,
      `Condition: ${truncate(alert.message, 500)}`,
      `Alert key: ${truncate(alert.alertKey, 700)}`,
      `Occurrence started: ${alert.occurrenceStartedAt.toISOString()}`,
      '',
    )
  })
  lines.push(
    'Read-only monitoring notice: no wallet or signer is connected, and this message is not a profitability or capital-deployment recommendation.',
  )
  return lines.join('\n')
}

function formatFeePercent(feeTier: number): string {
  return `${feeTier / 10_000}%`
}

function readRequiredValue(value: string | undefined, name: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${name} must be configured`)
  return normalized
}

function parsePositiveInteger(value: string, name: string): number {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) throw new Error(`${name} must be a positive integer`)
  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value
  return `${value.slice(0, Math.max(0, maximumLength - 1))}…`
}

function isTelegramSuccessPayload(value: unknown): value is { ok: true; result: { message_id: number } } {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.result)) return false
  return typeof value.result.message_id === 'number'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  void runMonitorTelegramNotifyCommand().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
