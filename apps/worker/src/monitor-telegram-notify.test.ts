import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SqliteMonitorAlertStateStore, type MonitorAlertState } from './monitor-alert-state.js'
import type { MonitorAlert } from './monitor-health.js'
import {
  buildTelegramAlertBatches,
  deliverPendingTelegramAlerts,
  readMonitorTelegramDestination,
  sendTelegramMessage,
  type MonitorTelegramDestination,
} from './monitor-telegram-notify.js'

const directories: string[] = []
const firstSeenAt = new Date('2026-07-21T08:00:00.000Z')
const deliveredAt = new Date('2026-07-21T08:05:00.000Z')
const resolvedAt = new Date('2026-07-21T08:10:00.000Z')
const reopenedAt = new Date('2026-07-21T08:15:00.000Z')
const destination: MonitorTelegramDestination = {
  botToken: '123456:secret-token',
  chatId: '-1001234567890',
  messageThreadId: null,
}
const alert: MonitorAlert = {
  alertKey: 'stale-observation:0x0000000000000000000000000000000000000010:500',
  severity: 'warning',
  code: 'stale-observation',
  poolAddress: '0x0000000000000000000000000000000000000010',
  feeTier: 500,
  message: 'Latest observation is stale.',
  observedAt: firstSeenAt,
}

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lp-mine-monitor-telegram-'))
  directories.push(directory)
  return join(directory, 'monitor.sqlite')
}

function seed(
  store: SqliteMonitorAlertStateStore,
  alerts: readonly MonitorAlert[] = [alert],
): readonly MonitorAlertState[] {
  return store.reconcile(alerts, firstSeenAt)
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('Telegram monitoring notifications', () => {
  it('reads credentials without exposing them in the result contract', () => {
    expect(
      readMonitorTelegramDestination({
        LP_MINE_TELEGRAM_BOT_TOKEN: ' token ',
        LP_MINE_TELEGRAM_CHAT_ID: ' -100123 ',
        LP_MINE_TELEGRAM_MESSAGE_THREAD_ID: '42',
      }),
    ).toEqual({
      botToken: 'token',
      chatId: '-100123',
      messageThreadId: 42,
    })
    expect(() => readMonitorTelegramDestination({})).toThrow('LP_MINE_TELEGRAM_BOT_TOKEN')
    expect(() =>
      readMonitorTelegramDestination({
        LP_MINE_TELEGRAM_BOT_TOKEN: 'token',
        LP_MINE_TELEGRAM_CHAT_ID: 'chat',
        LP_MINE_TELEGRAM_MESSAGE_THREAD_ID: 'zero',
      }),
    ).toThrow('positive integer')
  })

  it('sends each active unacknowledged occurrence once', async () => {
    const store = new SqliteMonitorAlertStateStore(databasePath())
    try {
      seed(store)
      const sender = vi.fn(async () => ({ messageId: '101' }))

      const first = await deliverPendingTelegramAlerts(
        store,
        destination,
        'degraded',
        deliveredAt,
        sender,
      )
      const repeated = await deliverPendingTelegramAlerts(
        store,
        destination,
        'degraded',
        resolvedAt,
        sender,
      )

      expect(first).toMatchObject({
        status: 'sent',
        candidateAlertCount: 1,
        deliveredAlertCount: 1,
        messageCount: 1,
      })
      expect(repeated).toMatchObject({
        status: 'no-op',
        candidateAlertCount: 0,
        deliveredAlertCount: 0,
        messageCount: 0,
      })
      expect(sender).toHaveBeenCalledTimes(1)
      expect(sender.mock.calls[0]?.[1]).toContain('no wallet or signer is connected')
    } finally {
      store.close()
    }
  })

  it('suppresses acknowledged alerts and notifies a reopened occurrence', async () => {
    const store = new SqliteMonitorAlertStateStore(databasePath())
    try {
      seed(store)
      expect(store.acknowledge(alert.alertKey, deliveredAt)).toBe(true)
      const sender = vi.fn(async () => ({ messageId: '102' }))

      const acknowledged = await deliverPendingTelegramAlerts(
        store,
        destination,
        'degraded',
        deliveredAt,
        sender,
      )
      store.reconcile([], resolvedAt)
      store.reconcile([alert], reopenedAt)
      const reopened = await deliverPendingTelegramAlerts(
        store,
        destination,
        'degraded',
        reopenedAt,
        sender,
      )

      expect(acknowledged.status).toBe('no-op')
      expect(reopened.status).toBe('sent')
      expect(sender).toHaveBeenCalledTimes(1)
    } finally {
      store.close()
    }
  })

  it('splits long alert sets into Telegram-safe batches', () => {
    const fixture: MonitorAlertState = {
      alertKey: `source-warning:0x0000000000000000000000000000000000000010:500:${'key'.repeat(300)}`,
      severity: 'warning',
      code: 'source-warning',
      poolAddress: '0x0000000000000000000000000000000000000010',
      feeTier: 500,
      message: 'warning '.repeat(200),
      status: 'active',
      firstSeenAt,
      occurrenceStartedAt: firstSeenAt,
      lastSeenAt: firstSeenAt,
      resolvedAt: null,
      acknowledgedAt: null,
    }
    const batches = buildTelegramAlertBatches(
      Array.from({ length: 12 }, (_, index) => ({
        ...fixture,
        alertKey: `${fixture.alertKey}:${index}`,
      })),
      'degraded',
      deliveredAt,
    )

    expect(batches.length).toBeGreaterThan(1)
    expect(batches.every((batch) => batch.text.length <= 3_900)).toBe(true)
    expect(batches.flatMap((batch) => batch.alerts)).toHaveLength(12)
  })

  it('sends JSON to Telegram and never includes the token in thrown errors', async () => {
    let requestBody: unknown
    const successFetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    await expect(sendTelegramMessage(destination, 'hello', successFetch)).resolves.toEqual({
      messageId: '777',
    })
    expect(requestBody).toEqual({
      chat_id: destination.chatId,
      text: 'hello',
      protect_content: true,
    })

    const failureFetch = vi.fn(async () => {
      throw new Error(`network failure for ${destination.botToken}`)
    }) as unknown as typeof fetch
    await expect(sendTelegramMessage(destination, 'hello', failureFetch)).rejects.not.toThrow(
      destination.botToken,
    )
  })
})
