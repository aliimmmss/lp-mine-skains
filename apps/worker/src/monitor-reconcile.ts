import { pathToFileURL } from 'node:url'
import { readMonitorHealthConfig } from './monitor-health-config.js'
import { buildMonitorHealthReport } from './monitor-health.js'
import { SqliteMonitorAlertStateStore, type MonitorAlertState } from './monitor-alert-state.js'

export type MonitorReconcileReport = {
  mode: 'read-only'
  generatedAt: Date
  databasePath: string
  healthStatus: 'healthy' | 'degraded' | 'critical'
  activeAlertCount: number
  resolvedAlertCount: number
  alerts: readonly MonitorAlertState[]
  disclaimer: string
}

export function buildMonitorReconcileReport(now = new Date()): MonitorReconcileReport {
  const config = readMonitorHealthConfig()
  const health = buildMonitorHealthReport(config, now)
  const store = new SqliteMonitorAlertStateStore(config.databasePath)
  try {
    const alerts = store.reconcile(health.alerts, now)
    return {
      mode: 'read-only',
      generatedAt: now,
      databasePath: config.databasePath,
      healthStatus: health.status,
      activeAlertCount: alerts.filter((alert) => alert.status === 'active').length,
      resolvedAlertCount: alerts.filter((alert) => alert.status === 'resolved').length,
      alerts,
      disclaimer:
        'Alert reconciliation stores local monitoring lifecycle state only. It does not send notifications, sign transactions, move funds, or recommend deploying capital.',
    }
  } finally {
    store.close()
  }
}

export function runMonitorReconcileCommand(): void {
  const result = buildMonitorReconcileReport()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  try {
    runMonitorReconcileCommand()
  } catch (error: unknown) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
