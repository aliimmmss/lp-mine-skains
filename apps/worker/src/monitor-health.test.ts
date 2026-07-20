import { describe, expect, it } from 'vitest'
import type { PoolHistoryReport } from './pools-history.js'
import { summarizeMonitorHealth } from './monitor-health.js'

const poolAddress = '0x0000000000000000000000000000000000000010' as const
const generatedAt = new Date('2026-07-21T00:00:00.000Z')

function history(overrides: Partial<PoolHistoryReport> = {}): PoolHistoryReport {
  return {
    mode: 'read-only',
    databasePath: '/tmp/evidence.sqlite',
    generatedAt,
    analyzedPools: [
      {
        poolAddress,
        pair: 'WETH/USDG',
        feeTier: 500,
        generatedAt,
        observationCount: 3,
        completeObservationCount: 3,
        firstBlock: 1n,
        lastBlock: 3n,
        blockSpan: 2n,
        firstObservedAt: new Date('2026-07-20T23:50:00.000Z'),
        lastObservedAt: new Date('2026-07-20T23:59:00.000Z'),
        elapsedSeconds: 540,
        expectedObservationCount: 2,
        coverage: { numerator: 1n, denominator: 1n },
        coveragePercent: '100.00%',
        largestGapSeconds: 300,
        price: {
          first: { numerator: 1n, denominator: 1n },
          last: { numerator: 1n, denominator: 1n },
          minimum: { numerator: 1n, denominator: 1n },
          maximum: { numerator: 1n, denominator: 1n },
          firstDecimal: '1.00000000',
          lastDecimal: '1.00000000',
          minimumDecimal: '1.00000000',
          maximumDecimal: '1.00000000',
          relativeChange: { numerator: 0n, denominator: 1n },
          relativeChangePercent: '0.00%',
        },
        tick: { first: 0, last: 0, minimum: 0, maximum: 0, netChange: 0, span: 0 },
        activeLiquidity: {
          first: 100n,
          last: 100n,
          minimum: 100n,
          maximum: 100n,
          nonZeroObservationCount: 3,
          nonZeroShare: { numerator: 1n, denominator: 1n },
          nonZeroPercent: '100.00%',
          relativeChange: { numerator: 0n, denominator: 1n },
          relativeChangePercent: '0.00%',
        },
        riskFlags: [],
        warnings: [],
        disclaimer: 'descriptive only',
      },
    ],
    missingPools: [],
    disclaimer: 'descriptive only',
    ...overrides,
  }
}

describe('monitor health summary', () => {
  it('returns healthy for fresh complete evidence', () => {
    const report = summarizeMonitorHealth(history(), 300, generatedAt)
    expect(report.status).toBe('healthy')
    expect(report.alerts).toEqual([])
    expect(report.pools[0]?.ageSeconds).toBe(60)
  })

  it('returns degraded for stale evidence', () => {
    const report = summarizeMonitorHealth(history(), 30, generatedAt)
    expect(report.status).toBe('degraded')
    expect(report.alerts.map((alert) => alert.code)).toEqual(['stale-observation'])
  })

  it('returns critical when a canonical pool is missing', () => {
    const report = summarizeMonitorHealth(
      history({
        analyzedPools: [],
        missingPools: [{ poolAddress, feeTier: 500 }],
      }),
      300,
      generatedAt,
    )
    expect(report.status).toBe('critical')
    expect(report.alerts[0]).toMatchObject({ severity: 'critical', code: 'missing-pool', feeTier: 500 })
  })

  it('treats persistent zero liquidity as critical', () => {
    const source = history()
    const analysis = source.analyzedPools[0]!
    const report = summarizeMonitorHealth(
      history({ analyzedPools: [{ ...analysis, riskFlags: ['persistent-zero-liquidity'] }] }),
      300,
      generatedAt,
    )
    expect(report.status).toBe('critical')
    expect(report.alerts[0]).toMatchObject({ severity: 'critical', code: 'history-risk' })
  })
})
