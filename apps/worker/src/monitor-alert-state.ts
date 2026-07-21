import { DatabaseSync } from 'node:sqlite'
import type { MonitorAlert, MonitorAlertCode, MonitorAlertSeverity } from './monitor-health.js'

export type MonitorAlertLifecycleStatus = 'active' | 'resolved'

export type MonitorAlertState = {
  alertKey: string
  severity: MonitorAlertSeverity
  code: MonitorAlertCode
  poolAddress: `0x${string}`
  feeTier: number
  message: string
  status: MonitorAlertLifecycleStatus
  firstSeenAt: Date
  lastSeenAt: Date
  resolvedAt: Date | null
  acknowledgedAt: Date | null
}

type AlertRow = {
  alert_key: string
  severity: MonitorAlertSeverity
  code: MonitorAlertCode
  pool_address: `0x${string}`
  fee_tier: number
  message: string
  status: MonitorAlertLifecycleStatus
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  acknowledged_at: string | null
}

export class SqliteMonitorAlertStateStore {
  readonly #database: DatabaseSync

  constructor(path: string) {
    this.#database = new DatabaseSync(path)
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS monitor_alert_state (
        alert_key TEXT PRIMARY KEY,
        severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
        code TEXT NOT NULL CHECK (code IN ('missing-pool', 'stale-observation', 'history-risk', 'source-warning')),
        pool_address TEXT NOT NULL,
        fee_tier INTEGER NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'resolved')),
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        resolved_at TEXT,
        acknowledged_at TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS monitor_alert_state_status
      ON monitor_alert_state(status, severity, fee_tier);
    `)
  }

  reconcile(alerts: readonly MonitorAlert[], observedAt: Date): readonly MonitorAlertState[] {
    assertValidDate(observedAt, 'observedAt')
    const timestamp = observedAt.toISOString()
    const activeKeys = new Set(alerts.map((alert) => alert.alertKey))
    const upsert = this.#database.prepare(`
      INSERT INTO monitor_alert_state (
        alert_key, severity, code, pool_address, fee_tier, message,
        status, first_seen_at, last_seen_at, resolved_at, acknowledged_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, NULL)
      ON CONFLICT(alert_key) DO UPDATE SET
        severity = excluded.severity,
        code = excluded.code,
        pool_address = excluded.pool_address,
        fee_tier = excluded.fee_tier,
        message = excluded.message,
        status = 'active',
        last_seen_at = excluded.last_seen_at,
        resolved_at = NULL,
        acknowledged_at = CASE
          WHEN monitor_alert_state.status = 'resolved' THEN NULL
          ELSE monitor_alert_state.acknowledged_at
        END
    `)

    this.#database.exec('BEGIN IMMEDIATE')
    try {
      for (const alert of alerts) {
        upsert.run(
          alert.alertKey,
          alert.severity,
          alert.code,
          alert.poolAddress,
          alert.feeTier,
          alert.message,
          timestamp,
          timestamp,
        )
      }
      const activeRows = this.#database
        .prepare("SELECT alert_key FROM monitor_alert_state WHERE status = 'active'")
        .all() as Array<{ alert_key: string }>
      const resolve = this.#database.prepare(`
        UPDATE monitor_alert_state
        SET status = 'resolved', resolved_at = ?
        WHERE alert_key = ? AND status = 'active'
      `)
      for (const row of activeRows) {
        if (!activeKeys.has(row.alert_key)) resolve.run(timestamp, row.alert_key)
      }
      this.#database.exec('COMMIT')
    } catch (error) {
      this.#database.exec('ROLLBACK')
      throw error
    }
    return this.list()
  }

  acknowledge(alertKey: string, acknowledgedAt: Date): boolean {
    if (alertKey.length === 0) throw new RangeError('alertKey must not be empty')
    assertValidDate(acknowledgedAt, 'acknowledgedAt')
    const result = this.#database
      .prepare(
        `
        UPDATE monitor_alert_state
        SET acknowledged_at = ?
        WHERE alert_key = ? AND status = 'active' AND acknowledged_at IS NULL
      `,
      )
      .run(acknowledgedAt.toISOString(), alertKey)
    return Number(result.changes) === 1
  }

  get(alertKey: string): MonitorAlertState | null {
    if (alertKey.length === 0) throw new RangeError('alertKey must not be empty')
    const row = this.#database.prepare('SELECT * FROM monitor_alert_state WHERE alert_key = ?').get(alertKey) as
      | AlertRow
      | undefined
    return row === undefined ? null : rowToState(row)
  }

  list(status?: MonitorAlertLifecycleStatus): readonly MonitorAlertState[] {
    const rows = (
      status
        ? this.#database
            .prepare('SELECT * FROM monitor_alert_state WHERE status = ? ORDER BY severity DESC, fee_tier, alert_key')
            .all(status)
        : this.#database
            .prepare('SELECT * FROM monitor_alert_state ORDER BY status, severity DESC, fee_tier, alert_key')
            .all()
    ) as AlertRow[]
    return rows.map(rowToState)
  }

  close(): void {
    this.#database.close()
  }
}

function rowToState(row: AlertRow): MonitorAlertState {
  return {
    alertKey: row.alert_key,
    severity: row.severity,
    code: row.code,
    poolAddress: row.pool_address,
    feeTier: row.fee_tier,
    message: row.message,
    status: row.status,
    firstSeenAt: new Date(row.first_seen_at),
    lastSeenAt: new Date(row.last_seen_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : null,
  }
}

function assertValidDate(value: Date, name: string): void {
  if (Number.isNaN(value.getTime())) throw new RangeError(`${name} must be valid`)
}
