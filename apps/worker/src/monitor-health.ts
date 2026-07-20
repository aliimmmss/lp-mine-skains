import type { PoolHistoryRiskFlag } from '@lp-mine/core'
import { pathToFileURL } from 'node:url'
import { buildPoolHistoryReport, type PoolHistoryReport } from './pools-history.js'
import { readMonitorHealthConfig, type MonitorHealthConfig } from './monitor-health-config.js'

export type MonitorHealthStatus = 'healthy' | 'degraded' | 'critical'
export type MonitorAlertSeverity = 'warning' | 'critical'
export type MonitorAlertCode = 'missing-pool' | 'stale-observation' | 'history-risk' | 'source-warning'

export type MonitorAlert = {
  alertKey: string
  severity: MonitorAlertSeverity
  code: MonitorAlertCode
  poolAddress: `0x${string}`
  feeTier: number
  message: string
  observedAt: Date | null
}

export type MonitorPoolHealth = {
  poolAddress: `0x${string}`
  feeTier: number
  status: MonitorHealthStatus
  lastObservedAt: Date | null
  ageSeconds: number | null
  observationCount: number
  coveragePercent: string | null
  riskFlags: readonly PoolHistoryRiskFlag[]
  warnings: readonly string[]
}

export type MonitorHealthSummary = {
  poolCounts: {
    total: number
    healthy: number
    degraded: number
    critical: number
  }
  alertCounts: {
    total: number
    warning: number
    critical: number
    byCode: Record<MonitorAlertCode, number>
  }
  oldestObservationAgeSeconds: number | null
}

export type MonitorHealthReport = {
  mode: 'read-only'
  generatedAt: Date
  status: MonitorHealthStatus
  source: {
    databasePath: string
    historyGeneratedAt: Date
  }
  maximumObservationAgeSeconds: number
  summary: MonitorHealthSummary
  pools: readonly MonitorPoolHealth[]
  alerts: readonly MonitorAlert[]
  disclaimer: string
}

function statusFromAlerts(alerts: readonly MonitorAlert[]): MonitorHealthStatus {
  if (alerts.some((alert) => alert.severity === 'critical')) return 'critical'
  return alerts.length > 0 ? 'degraded' : 'healthy'
}

function riskSeverity(flag: PoolHistoryRiskFlag): MonitorAlertSeverity {
  return flag === 'persistent-zero-liquidity' || flag === 'insufficient-observations' ? 'critical' : 'warning'
}

function alertKey(code: MonitorAlertCode, poolAddress: `0x${string}`, feeTier: number, detail?: string): string {
  return [code, poolAddress.toLowerCase(), feeTier.toString(), detail].filter((part) => part !== undefined).join(':')
}

function summarizeCounts(pools: readonly MonitorPoolHealth[], alerts: readonly MonitorAlert[]): MonitorHealthSummary {
  const poolCounts = {
    total: pools.length,
    healthy: pools.filter((pool) => pool.status === 'healthy').length,
    degraded: pools.filter((pool) => pool.status === 'degraded').length,
    critical: pools.filter((pool) => pool.status === 'critical').length,
  }
  const byCode: Record<MonitorAlertCode, number> = {
    'missing-pool': 0,
    'stale-observation': 0,
    'history-risk': 0,
    'source-warning': 0,
  }
  for (const alert of alerts) byCode[alert.code] += 1
  const ages = pools.flatMap((pool) => (pool.ageSeconds === null ? [] : [pool.ageSeconds]))

  return {
    poolCounts,
    alertCounts: {
      total: alerts.length,
      warning: alerts.filter((alert) => alert.severity === 'warning').length,
      critical: alerts.filter((alert) => alert.severity === 'critical').length,
      byCode,
    },
    oldestObservationAgeSeconds: ages.length === 0 ? null : Math.max(...ages),
  }
}

export function summarizeMonitorHealth(
  history: PoolHistoryReport,
  maximumObservationAgeSeconds: number,
  now = history.generatedAt,
): MonitorHealthReport {
  if (!Number.isInteger(maximumObservationAgeSeconds) || maximumObservationAgeSeconds <= 0) {
    throw new RangeError('maximumObservationAgeSeconds must be a positive integer')
  }
  if (Number.isNaN(now.getTime())) throw new RangeError('now must be valid')

  const alerts: MonitorAlert[] = []
  const pools: MonitorPoolHealth[] = []

  for (const missing of history.missingPools) {
    const alert: MonitorAlert = {
      alertKey: alertKey('missing-pool', missing.poolAddress, missing.feeTier),
      severity: 'critical',
      code: 'missing-pool',
      poolAddress: missing.poolAddress,
      feeTier: missing.feeTier,
      message: 'No stored observations are available for this canonical pool.',
      observedAt: null,
    }
    alerts.push(alert)
    pools.push({
      poolAddress: missing.poolAddress,
      feeTier: missing.feeTier,
      status: 'critical',
      lastObservedAt: null,
      ageSeconds: null,
      observationCount: 0,
      coveragePercent: null,
      riskFlags: [],
      warnings: [],
    })
  }

  for (const analysis of history.analyzedPools) {
    const ageSeconds = Math.max(0, Math.floor((now.getTime() - analysis.lastObservedAt.getTime()) / 1_000))
    const poolAlerts: MonitorAlert[] = []
    if (ageSeconds > maximumObservationAgeSeconds) {
      poolAlerts.push({
        alertKey: alertKey('stale-observation', analysis.poolAddress, analysis.feeTier),
        severity: 'warning',
        code: 'stale-observation',
        poolAddress: analysis.poolAddress,
        feeTier: analysis.feeTier,
        message: `Latest observation age ${ageSeconds}s exceeds the ${maximumObservationAgeSeconds}s threshold.`,
        observedAt: analysis.lastObservedAt,
      })
    }
    for (const flag of analysis.riskFlags) {
      poolAlerts.push({
        alertKey: alertKey('history-risk', analysis.poolAddress, analysis.feeTier, flag),
        severity: riskSeverity(flag),
        code: 'history-risk',
        poolAddress: analysis.poolAddress,
        feeTier: analysis.feeTier,
        message: `Pool history risk flag: ${flag}.`,
        observedAt: analysis.lastObservedAt,
      })
    }
    for (const warning of analysis.warnings) {
      poolAlerts.push({
        alertKey: alertKey('source-warning', analysis.poolAddress, analysis.feeTier, warning),
        severity: 'warning',
        code: 'source-warning',
        poolAddress: analysis.poolAddress,
        feeTier: analysis.feeTier,
        message: warning,
        observedAt: analysis.lastObservedAt,
      })
    }
    alerts.push(...poolAlerts)
    pools.push({
      poolAddress: analysis.poolAddress,
      feeTier: analysis.feeTier,
      status: statusFromAlerts(poolAlerts),
      lastObservedAt: analysis.lastObservedAt,
      ageSeconds,
      observationCount: analysis.observationCount,
      coveragePercent: analysis.coveragePercent,
      riskFlags: analysis.riskFlags,
      warnings: analysis.warnings,
    })
  }

  pools.sort((left, right) => left.feeTier - right.feeTier)
  alerts.sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === 'critical' ? -1 : 1
    if (left.feeTier !== right.feeTier) return left.feeTier - right.feeTier
    return left.alertKey.localeCompare(right.alertKey)
  })

  return {
    mode: 'read-only',
    generatedAt: now,
    status: statusFromAlerts(alerts),
    source: {
      databasePath: history.databasePath,
      historyGeneratedAt: history.generatedAt,
    },
    maximumObservationAgeSeconds,
    summary: summarizeCounts(pools, alerts),
    pools,
    alerts,
    disclaimer:
      'Monitoring status summarizes stored evidence freshness, coverage, and explicit risk flags. It does not estimate APR, profitability, execution quality, or whether capital should be deployed.',
  }
}

export function buildMonitorHealthReport(config: MonitorHealthConfig, now = new Date()): MonitorHealthReport {
  const history = buildPoolHistoryReport(
    {
      databasePath: config.databasePath,
      expectedIntervalSeconds: config.expectedIntervalSeconds,
      minimumCoverageBps: config.minimumCoverageBps,
      limit: config.historyLimit,
    },
    now,
  )
  return summarizeMonitorHealth(history, config.maximumObservationAgeSeconds, now)
}

export function runMonitorHealthCommand(): void {
  const result = buildMonitorHealthReport(readMonitorHealthConfig())
  process.stdout.write(
    `${JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
  )
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  try {
    runMonitorHealthCommand()
  } catch (error: unknown) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
