import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SqliteMonitorAlertStateStore, type MonitorAlertState } from './monitor-alert-state.js'
import { readMonitorHealthConfig, type MonitorHealthConfig } from './monitor-health-config.js'
import { buildMonitorHealthReport, type MonitorHealthReport, type MonitorPoolHealth } from './monitor-health.js'

export type MonitorDashboardSnapshot = {
  mode: 'read-only'
  generatedAt: Date
  health: MonitorHealthReport
  lifecycle: {
    activeAlertCount: number
    resolvedAlertCount: number
    unacknowledgedActiveAlertCount: number
    alerts: readonly MonitorAlertState[]
  }
  disclaimer: string
}

export function readMonitorDashboardOutputPath(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.LP_MINE_DASHBOARD_PATH?.trim()
  return configured && configured.length > 0 ? configured : './data/monitor-dashboard.html'
}

export function buildMonitorDashboardSnapshot(
  config: MonitorHealthConfig,
  now = new Date(),
): MonitorDashboardSnapshot {
  const health = buildMonitorHealthReport(config, now)
  const store = new SqliteMonitorAlertStateStore(config.databasePath)
  try {
    const alerts = store.reconcile(health.alerts, now)
    const activeAlerts = alerts.filter((alert) => alert.status === 'active')
    return {
      mode: 'read-only',
      generatedAt: now,
      health,
      lifecycle: {
        activeAlertCount: activeAlerts.length,
        resolvedAlertCount: alerts.filter((alert) => alert.status === 'resolved').length,
        unacknowledgedActiveAlertCount: activeAlerts.filter((alert) => alert.acknowledgedAt === null).length,
        alerts,
      },
      disclaimer:
        'This local dashboard summarizes stored monitoring evidence and alert lifecycle metadata. It does not send notifications, estimate profitability, sign transactions, or move funds.',
    }
  } finally {
    store.close()
  }
}

export function renderMonitorDashboard(snapshot: MonitorDashboardSnapshot): string {
  const status = snapshot.health.status
  const summary = snapshot.health.summary
  const generatedAt = formatDate(snapshot.generatedAt)
  const pools = snapshot.health.pools.map(renderPoolRow).join('\n')
  const alerts = snapshot.lifecycle.alerts.map(renderAlertRow).join('\n')
  const embeddedSnapshot = escapeJsonForHtml(JSON.stringify(snapshot))

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>LP Mine monitoring dashboard</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #08111f; color: #e5eefb; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; background: radial-gradient(circle at top, #13233d 0, #08111f 48rem); }
    main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 56px; }
    h1, h2 { margin: 0; }
    h1 { font-size: clamp(1.9rem, 5vw, 3.4rem); letter-spacing: -0.04em; }
    h2 { font-size: 1rem; letter-spacing: 0.02em; }
    p { color: #a9bad1; line-height: 1.6; }
    .eyebrow { margin-bottom: 10px; color: #7dd3fc; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
    .hero { display: grid; gap: 22px; padding: 28px; border: 1px solid #27415f; border-radius: 24px; background: rgba(11, 25, 44, 0.88); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28); }
    .status-line { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .badge { display: inline-flex; align-items: center; min-height: 30px; padding: 5px 11px; border-radius: 999px; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; }
    .healthy { background: #123c31; color: #86efac; }
    .degraded, .warning { background: #4a3711; color: #fde68a; }
    .critical { background: #4a1f29; color: #fda4af; }
    .resolved { background: #243448; color: #cbd5e1; }
    .meta { display: grid; gap: 7px; color: #a9bad1; font-size: 0.88rem; }
    .meta code { overflow-wrap: anywhere; color: #dbeafe; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 20px 0; }
    .card, .panel { border: 1px solid #223b57; border-radius: 18px; background: rgba(9, 22, 39, 0.88); }
    .card { padding: 18px; }
    .card .label { color: #8ea3bd; font-size: 0.74rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .card .value { margin-top: 8px; font-size: 1.9rem; font-weight: 850; letter-spacing: -0.04em; }
    .panel { margin-top: 20px; overflow: hidden; }
    .panel-header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: center; padding: 18px 20px; border-bottom: 1px solid #223b57; }
    .panel-header p { margin: 0; font-size: 0.85rem; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 780px; }
    th, td { padding: 14px 18px; border-bottom: 1px solid #1d334c; text-align: left; vertical-align: top; }
    th { color: #8ea3bd; font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; }
    td { font-size: 0.88rem; }
    tr:last-child td { border-bottom: 0; }
    code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 0.82em; }
    .muted { color: #8ea3bd; }
    .empty { padding: 24px 20px; color: #8ea3bd; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { padding: 4px 7px; border-radius: 8px; background: #172a42; color: #c7d7ea; font-size: 0.72rem; }
    footer { margin-top: 22px; padding: 0 4px; }
    footer p { margin: 0; font-size: 0.82rem; }
    @media (max-width: 860px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 520px) { main { width: min(100% - 20px, 1180px); padding-top: 10px; } .hero { padding: 20px; border-radius: 18px; } .cards { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div>
        <div class="eyebrow">Read-only operator view</div>
        <div class="status-line">
          <h1>LP Mine monitoring</h1>
          <span class="badge ${status}">${escapeHtml(status)}</span>
        </div>
        <p>Canonical WETH/USDG pool freshness, coverage, explicit risk flags, and local alert lifecycle state.</p>
      </div>
      <div class="meta">
        <span>Generated: <strong>${generatedAt}</strong></span>
        <span>Evidence database: <code>${escapeHtml(snapshot.health.source.databasePath)}</code></span>
        <span>Observation age threshold: <strong>${snapshot.health.maximumObservationAgeSeconds}s</strong></span>
      </div>
    </section>

    <section class="cards" aria-label="Monitoring summary">
      ${renderSummaryCard('Canonical pools', summary.poolCounts.total.toString(), `${summary.poolCounts.healthy} healthy`)}
      ${renderSummaryCard('Active alerts', snapshot.lifecycle.activeAlertCount.toString(), `${snapshot.lifecycle.unacknowledgedActiveAlertCount} unacknowledged`)}
      ${renderSummaryCard('Critical alerts', summary.alertCounts.critical.toString(), `${summary.alertCounts.warning} warnings`)}
      ${renderSummaryCard('Oldest evidence', formatAge(summary.oldestObservationAgeSeconds), 'stored observation age')}
    </section>

    <section class="panel">
      <div class="panel-header">
        <div><h2>Canonical pool health</h2><p>Missing, stale, partial, and risk states remain explicit.</p></div>
        <span class="badge ${status}">${escapeHtml(status)}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fee tier</th><th>Status</th><th>Latest observation</th><th>Age</th><th>Coverage</th><th>Evidence</th></tr></thead>
          <tbody>
            ${pools || '<tr><td colspan="6" class="empty">No canonical pool rows are available.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div><h2>Alert lifecycle</h2><p>Lifecycle rows are keyed by deterministic alert identity.</p></div>
        <span class="badge resolved">${snapshot.lifecycle.resolvedAlertCount} resolved</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>State</th><th>Severity</th><th>Condition</th><th>Pool</th><th>First seen</th><th>Last seen / resolved</th></tr></thead>
          <tbody>
            ${alerts || '<tr><td colspan="6" class="empty">No lifecycle alerts have been recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <footer><p>${escapeHtml(snapshot.disclaimer)}</p></footer>
    <script id="monitor-dashboard-data" type="application/json">${embeddedSnapshot}</script>
  </main>
</body>
</html>
`
}

export function writeMonitorDashboard(snapshot: MonitorDashboardSnapshot, outputPath: string): string {
  const resolvedPath = resolve(outputPath)
  mkdirSync(dirname(resolvedPath), { recursive: true })
  writeFileSync(resolvedPath, renderMonitorDashboard(snapshot), 'utf8')
  return resolvedPath
}

export function runMonitorDashboardCommand(): void {
  const healthConfig = readMonitorHealthConfig()
  const snapshot = buildMonitorDashboardSnapshot(healthConfig)
  const dashboardPath = writeMonitorDashboard(snapshot, readMonitorDashboardOutputPath())
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: snapshot.mode,
        generatedAt: snapshot.generatedAt,
        dashboardPath,
        healthStatus: snapshot.health.status,
        activeAlertCount: snapshot.lifecycle.activeAlertCount,
        resolvedAlertCount: snapshot.lifecycle.resolvedAlertCount,
        disclaimer: snapshot.disclaimer,
      },
      null,
      2,
    )}\n`,
  )
}

function renderSummaryCard(label: string, value: string, detail: string): string {
  return `<article class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div><div class="muted">${escapeHtml(detail)}</div></article>`
}

function renderPoolRow(pool: MonitorPoolHealth): string {
  const evidence = [...pool.riskFlags, ...pool.warnings]
  return `<tr>
    <td><strong>${formatFeeTier(pool.feeTier)}</strong><br><code>${escapeHtml(pool.poolAddress)}</code></td>
    <td><span class="badge ${pool.status}">${escapeHtml(pool.status)}</span></td>
    <td>${formatDate(pool.lastObservedAt)}</td>
    <td>${formatAge(pool.ageSeconds)}</td>
    <td>${pool.coveragePercent === null ? '<span class="muted">Unavailable</span>' : `${escapeHtml(pool.coveragePercent)}%`}</td>
    <td>${renderTags(evidence, pool.observationCount === 0 ? 'No stored observations' : `${pool.observationCount} observations`)}</td>
  </tr>`
}

function renderAlertRow(alert: MonitorAlertState): string {
  const acknowledged = alert.acknowledgedAt === null ? 'Unacknowledged' : `Acknowledged ${formatDate(alert.acknowledgedAt)}`
  const finalTimestamp = alert.resolvedAt === null ? formatDate(alert.lastSeenAt) : `Resolved ${formatDate(alert.resolvedAt)}`
  return `<tr>
    <td><span class="badge ${alert.status}">${escapeHtml(alert.status)}</span><br><span class="muted">${escapeHtml(acknowledged)}</span></td>
    <td><span class="badge ${alert.severity}">${escapeHtml(alert.severity)}</span></td>
    <td><strong>${escapeHtml(alert.code)}</strong><br>${escapeHtml(alert.message)}<br><code>${escapeHtml(alert.alertKey)}</code></td>
    <td>${formatFeeTier(alert.feeTier)}<br><code>${escapeHtml(alert.poolAddress)}</code></td>
    <td>${formatDate(alert.firstSeenAt)}</td>
    <td>${finalTimestamp}</td>
  </tr>`
}

function renderTags(values: readonly string[], fallback: string): string {
  if (values.length === 0) return `<span class="muted">${escapeHtml(fallback)}</span>`
  return `<div class="tags">${values.map((value) => `<span class="tag">${escapeHtml(value)}</span>`).join('')}</div>`
}

function formatFeeTier(feeTier: number): string {
  return `${(feeTier / 10_000).toFixed(2).replace(/\.?0+$/, '')}%`
}

function formatAge(ageSeconds: number | null): string {
  if (ageSeconds === null) return 'Unavailable'
  if (ageSeconds < 60) return `${ageSeconds}s`
  if (ageSeconds < 3_600) return `${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s`
  const hours = Math.floor(ageSeconds / 3_600)
  return `${hours}h ${Math.floor((ageSeconds % 3_600) / 60)}m`
}

function formatDate(value: Date | null): string {
  return value === null ? 'Unavailable' : escapeHtml(value.toISOString())
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeJsonForHtml(value: string): string {
  return value
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  try {
    runMonitorDashboardCommand()
  } catch (error: unknown) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
