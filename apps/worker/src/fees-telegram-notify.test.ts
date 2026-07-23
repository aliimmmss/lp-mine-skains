import { describe, expect, it } from 'vitest'
import { formatFeeDigestMessage } from './fees-telegram-notify.js'
import type { PoolFeeEntry, PoolFeeReport } from './pools-fees.js'

const generatedAt = new Date('2026-07-23T12:00:00.000Z')

function entry(overrides: Partial<PoolFeeEntry>): PoolFeeEntry {
  return {
    feeTier: 500,
    poolAddress: '0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a',
    pair: 'WETH/USDG',
    status: 'complete',
    windowSeconds: 86_400,
    sampleCount: 24,
    earlierObservedAt: '2026-07-22T12:00:00.000Z',
    laterObservedAt: '2026-07-23T12:00:00.000Z',
    currentTick: -200_000,
    currentActiveLiquidity: '800000000000000000',
    referenceLiquidity: '1000000000000000000',
    dailyFeesToken0Decimal: '1.5',
    dailyFeesToken1Decimal: '3000.0',
    dailyFeesCombinedInToken1Decimal: '6000.000000',
    occupancy: {
      currentTick: -200_000,
      sampleCount: 24,
      bands: [
        {
          label: '±1%',
          percent: 0.01,
          halfWidthTicks: 100,
          lowerTick: -200_100,
          upperTick: -199_900,
          observationsInRange: 12,
          occupancyDecimal: '0.500000',
        },
      ],
    },
    warnings: [],
    ...overrides,
  }
}

function report(pools: PoolFeeEntry[]): PoolFeeReport {
  return {
    mode: 'read-only',
    databasePath: ':memory:',
    generatedAt,
    configuredWindowSeconds: 86_400,
    referenceLiquidity: '1000000000000000000',
    pools,
    disclaimer: 'test disclaimer',
  }
}

describe('formatFeeDigestMessage', () => {
  it('lists complete pools ranked with combined fees and occupancy', () => {
    const message = formatFeeDigestMessage(
      report([
        entry({ feeTier: 100, dailyFeesCombinedInToken1Decimal: '8800.000000' }),
        entry({ feeTier: 500, dailyFeesCombinedInToken1Decimal: '6000.000000' }),
      ]),
    )
    expect(message).toContain('LP Mine fee digest')
    expect(message).toContain('0.01%')
    expect(message).toContain('0.05%')
    expect(message).toContain('8800')
    expect(message).toContain('±1%')
    // decision disclaimer present
    expect(message.toLowerCase()).toContain('not')
  })

  it('marks pools that lack sufficient data instead of hiding them', () => {
    const message = formatFeeDigestMessage(
      report([
        entry({ feeTier: 100 }),
        entry({
          feeTier: 10_000,
          status: 'insufficient',
          dailyFeesCombinedInToken1Decimal: null,
          windowSeconds: null,
        }),
      ]),
    )
    expect(message).toContain('1%') // the 1.00% tier label appears
    expect(message.toLowerCase()).toContain('insufficient')
  })
})
