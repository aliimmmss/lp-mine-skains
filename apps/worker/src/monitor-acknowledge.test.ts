import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteMonitorAlertStateStore } from './monitor-alert-state.js'
import {
  buildMonitorAcknowledgeReport,
  parseMonitorAcknowledgeAlertKey,
  type MonitorAcknowledgeStatus,
} from './monitor-acknowledge.js'
import { readMonitorDatabasePath } from './monitor-health-config.js'
import type { MonitorAlert } from './monitor-health.js'

const directories: string[] = []
const firstSeenAt = new Date('2026-07-21T08:00:00.000Z')
const acknowledgedAt = new Date('2026-07-21T08:05:00.000Z')
const later = new Date('2026-07-21T08:10:00.000Z')
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
  const directory = mkdtempSync(join(tmpdir(), 'lp-mine-monitor-acknowledge-'))
  directories.push(directory)
  return join(directory, 'monitor.sqlite')
}

function seedActiveAlert(path: string): void {
  const store = new SqliteMonitorAlertStateStore(path)
  try {
    store.reconcile([alert], firstSeenAt)
  } finally {
    store.close()
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('monitor acknowledgement', () => {
  it('parses exactly one non-empty alert key', () => {
    expect(parseMonitorAcknowledgeAlertKey(['--', ` ${alert.alertKey} `])).toBe(alert.alertKey)
    expect(() => parseMonitorAcknowledgeAlertKey([])).toThrow('requires exactly one')
    expect(() => parseMonitorAcknowledgeAlertKey(['one', 'two'])).toThrow('requires exactly one')
    expect(() => parseMonitorAcknowledgeAlertKey(['   '])).toThrow('requires exactly one')
  })

  it('records the first acknowledgement and returns the updated lifecycle row', () => {
    const path = databasePath()
    seedActiveAlert(path)

    const result = buildMonitorAcknowledgeReport(path, alert.alertKey, acknowledgedAt)

    expect(result).toMatchObject({
      mode: 'read-only',
      databasePath: path,
      alertKey: alert.alertKey,
      status: 'acknowledged' satisfies MonitorAcknowledgeStatus,
      changed: true,
    })
    expect(result.alert?.acknowledgedAt).toEqual(acknowledgedAt)
    expect(result.alert?.status).toBe('active')
  })

  it('preserves the first acknowledgement timestamp on repeated commands', () => {
    const path = databasePath()
    seedActiveAlert(path)
    buildMonitorAcknowledgeReport(path, alert.alertKey, acknowledgedAt)

    const repeated = buildMonitorAcknowledgeReport(path, alert.alertKey, later)

    expect(repeated.status).toBe('already-acknowledged')
    expect(repeated.changed).toBe(false)
    expect(repeated.alert?.acknowledgedAt).toEqual(acknowledgedAt)
  })

  it('does not acknowledge resolved or missing alerts', () => {
    const path = databasePath()
    seedActiveAlert(path)
    const store = new SqliteMonitorAlertStateStore(path)
    try {
      store.reconcile([], later)
    } finally {
      store.close()
    }

    const resolved = buildMonitorAcknowledgeReport(path, alert.alertKey, later)
    const missing = buildMonitorAcknowledgeReport(path, 'missing-pool:unknown:100', later)

    expect(resolved.status).toBe('not-active')
    expect(resolved.changed).toBe(false)
    expect(resolved.alert?.status).toBe('resolved')
    expect(missing.status).toBe('not-found')
    expect(missing.changed).toBe(false)
    expect(missing.alert).toBeNull()
  })

  it('reads only the database path needed by the acknowledgement command', () => {
    expect(readMonitorDatabasePath({ LP_MINE_DATABASE_PATH: ' ./custom/monitor.sqlite ' })).toBe(
      './custom/monitor.sqlite',
    )
    expect(readMonitorDatabasePath({ LP_MINE_DATABASE_PATH: '   ' })).toBe('./data/robinhood-univ3.sqlite')
  })
})
