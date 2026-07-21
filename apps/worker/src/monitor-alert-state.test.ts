import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { MonitorAlert } from './monitor-health.js'
import { SqliteMonitorAlertStateStore } from './monitor-alert-state.js'

const directories: string[] = []
const firstSeenAt = new Date('2026-07-21T00:00:00.000Z')
const later = new Date('2026-07-21T00:05:00.000Z')
const resolvedAt = new Date('2026-07-21T00:10:00.000Z')
const reopenedAt = new Date('2026-07-21T00:15:00.000Z')

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lp-mine-monitor-alert-state-'))
  directories.push(directory)
  return join(directory, 'monitor.sqlite')
}

const alert: MonitorAlert = {
  alertKey: 'stale-observation:0x0000000000000000000000000000000000000010:500',
  severity: 'warning',
  code: 'stale-observation',
  poolAddress: '0x0000000000000000000000000000000000000010',
  feeTier: 500,
  message: 'Latest observation is stale.',
  observedAt: new Date('2026-07-20T23:50:00.000Z'),
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('monitor alert state store', () => {
  it('tracks first and repeated sightings without duplicating alerts', () => {
    const store = new SqliteMonitorAlertStateStore(databasePath())
    try {
      store.reconcile([alert], firstSeenAt)
      const states = store.reconcile([{ ...alert, message: 'Latest observation age is now 600s.' }], later)
      expect(states).toHaveLength(1)
      expect(states[0]).toMatchObject({
        status: 'active',
        message: 'Latest observation age is now 600s.',
        firstSeenAt,
        occurrenceStartedAt: firstSeenAt,
        lastSeenAt: later,
        resolvedAt: null,
      })
    } finally {
      store.close()
    }
  })

  it('resolves absent alerts and reopens them as a new unacknowledged occurrence', () => {
    const store = new SqliteMonitorAlertStateStore(databasePath())
    try {
      store.reconcile([alert], firstSeenAt)
      expect(store.acknowledge(alert.alertKey, later)).toBe(true)
      const resolved = store.reconcile([], resolvedAt)[0]!
      expect(resolved.status).toBe('resolved')
      expect(resolved.acknowledgedAt).toEqual(later)
      expect(resolved.resolvedAt).toEqual(resolvedAt)

      const reopened = store.reconcile([alert], reopenedAt)[0]!
      expect(reopened.status).toBe('active')
      expect(reopened.firstSeenAt).toEqual(firstSeenAt)
      expect(reopened.occurrenceStartedAt).toEqual(reopenedAt)
      expect(reopened.lastSeenAt).toEqual(reopenedAt)
      expect(reopened.resolvedAt).toBeNull()
      expect(reopened.acknowledgedAt).toBeNull()
    } finally {
      store.close()
    }
  })

  it('only acknowledges active alerts', () => {
    const store = new SqliteMonitorAlertStateStore(databasePath())
    try {
      expect(store.acknowledge(alert.alertKey, firstSeenAt)).toBe(false)
      store.reconcile([alert], firstSeenAt)
      expect(store.acknowledge(alert.alertKey, later)).toBe(true)
      expect(store.list('active')[0]?.acknowledgedAt).toEqual(later)
      store.reconcile([], resolvedAt)
      expect(store.acknowledge(alert.alertKey, reopenedAt)).toBe(false)
    } finally {
      store.close()
    }
  })

  it('deduplicates delivery for one occurrence and allows a reopened occurrence', () => {
    const store = new SqliteMonitorAlertStateStore(databasePath())
    try {
      const active = store.reconcile([alert], firstSeenAt)[0]!
      expect(store.listPendingNotificationAlerts('telegram')).toHaveLength(1)
      expect(store.recordNotificationDelivery('telegram', active, later, '101')).toBe(true)
      expect(store.recordNotificationDelivery('telegram', active, later, '101')).toBe(false)
      expect(store.listPendingNotificationAlerts('telegram')).toHaveLength(0)

      store.reconcile([], resolvedAt)
      store.reconcile([alert], reopenedAt)
      expect(store.listPendingNotificationAlerts('telegram')).toHaveLength(1)
    } finally {
      store.close()
    }
  })

  it('migrates legacy lifecycle rows to an explicit occurrence timestamp', () => {
    const path = databasePath()
    const database = new DatabaseSync(path)
    database.exec(`
      CREATE TABLE monitor_alert_state (
        alert_key TEXT PRIMARY KEY,
        severity TEXT NOT NULL,
        code TEXT NOT NULL,
        pool_address TEXT NOT NULL,
        fee_tier INTEGER NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        resolved_at TEXT,
        acknowledged_at TEXT
      ) STRICT;
      INSERT INTO monitor_alert_state VALUES (
        '${alert.alertKey}',
        '${alert.severity}',
        '${alert.code}',
        '${alert.poolAddress}',
        ${alert.feeTier},
        '${alert.message}',
        'active',
        '${firstSeenAt.toISOString()}',
        '${later.toISOString()}',
        NULL,
        NULL
      );
    `)
    database.close()

    const store = new SqliteMonitorAlertStateStore(path)
    try {
      expect(store.get(alert.alertKey)?.occurrenceStartedAt).toEqual(firstSeenAt)
    } finally {
      store.close()
    }
  })
})
