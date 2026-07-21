import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { MonitorAlertState } from './monitor-alert-state.js'
import type { MonitorHealthReport } from './monitor-health.js'
import {
  readMonitorDashboardOutputPath,
  renderMonitorDashboard,
  type MonitorDashboardSnapshot,
  writeMonitorDashboard,
} from './monitor-dashboard.js'

const directories: string[] = []
const generatedAt = new Date('2026-07-21T08:00:00.000Z')

function fixture(message = 'Latest observation is stale.'): MonitorDashboardSnapshot {
  const health: MonitorHealthReport = {
    mode: 'read-only',
    generatedAt,
    status: 'critical',
    source: {
      databasePath: './data/robinhood-univ3.sqlite',
      historyGeneratedAt: generatedAt,
    },
    maximumObservationAgeSeconds: 900,
    summary: {
      poolCounts: { total: 2, healthy: 0, degraded: 1, critical: 1 },
      alertCounts: {
        total: 2,
        warning: 1,
        critical: 1,
        byCode: {
          'missing-pool': 1,
          'stale-observation': 1,
          'history-risk': 0,
          'source-warning': 0,
        },
      },
      oldestObservationAgeSeconds: 3_660,
    },
    pools: [
      {
        poolAddress: '0x0000000000000000000000000000000000000010',
        feeTier: 500,
        status: 'degraded',
        lastObservedAt: new Date('2026-07-21T06:59:00.000Z'),
        ageSeconds: 3_660,
        observationCount: 8,
        coveragePercent: '75.00',
        riskFlags: ['coverage-gap'],
        warnings: [],
      },
      {
        poolAddress: '0x0000000000000000000000000000000000000020',
        feeTier: 3_000,
        status: 'critical',
        lastObservedAt: null,
        ageSeconds: null,
        observationCount: 0,
        coveragePercent: null,
        riskFlags: [],
        warnings: [],
      },
    ],
    alerts: [],
    disclaimer: 'Health disclaimer.',
  }
  const alerts: readonly MonitorAlertState[] = [
    {
      alertKey: 'stale-observation:0x0000000000000000000000000000000000000010:500',
      severity: 'warning',
      code: 'stale-observation',
      poolAddress: '0x0000000000000000000000000000000000000010',
      feeTier: 500,
      message,
      status: 'active',
      firstSeenAt: generatedAt,
      occurrenceStartedAt: generatedAt,
      lastSeenAt: generatedAt,
      resolvedAt: null,
      acknowledgedAt: null,
    },
  ]
  return {
    mode: 'read-only',
    generatedAt,
    health,
    lifecycle: {
      activeAlertCount: 1,
      resolvedAlertCount: 0,
      unacknowledgedActiveAlertCount: 1,
      alerts,
    },
    disclaimer: 'Dashboard disclaimer.',
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('monitor dashboard', () => {
  it('renders explicit health, missing-data, and alert lifecycle states', () => {
    const html = renderMonitorDashboard(fixture())
    expect(html).toContain('<title>LP Mine monitoring dashboard</title>')
    expect(html).toContain('0.05%')
    expect(html).toContain('0.3%')
    expect(html).toContain('coverage-gap')
    expect(html).toContain('No stored observations')
    expect(html).toContain('Unacknowledged')
    expect(html).toContain('stale-observation')
    expect(html).toContain('1h 1m')
  })

  it('escapes evidence text in markup and embedded JSON', () => {
    const html = renderMonitorDashboard(fixture('<script>alert("unsafe")</script>'))
    expect(html).not.toContain('<script>alert("unsafe")</script>')
    expect(html).toContain('&lt;script&gt;alert(&quot;unsafe&quot;)&lt;/script&gt;')
    expect(html).toContain('\\u003cscript\\u003ealert')
  })

  it('writes a self-contained dashboard and creates parent directories', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lp-mine-monitor-dashboard-'))
    directories.push(directory)
    const outputPath = join(directory, 'nested', 'dashboard.html')
    expect(writeMonitorDashboard(fixture(), outputPath)).toBe(outputPath)
    expect(readFileSync(outputPath, 'utf8')).toContain('id="monitor-dashboard-data"')
  })

  it('uses an explicit output path and a deterministic default', () => {
    expect(readMonitorDashboardOutputPath({ LP_MINE_DASHBOARD_PATH: './custom/dashboard.html' })).toBe(
      './custom/dashboard.html',
    )
    expect(readMonitorDashboardOutputPath({})).toBe('./data/monitor-dashboard.html')
  })
})
