import { describe, expect, it } from 'vitest'
import { computeTickOccupancy, percentToTickHalfWidth } from './tick-occupancy.js'

describe('percentToTickHalfWidth', () => {
  it('converts a price percentage to an approximate tick half-width', () => {
    // ln(1.01)/ln(1.0001) ~= 99.5 -> 100
    expect(percentToTickHalfWidth(0.01)).toBe(100)
    // ln(1.05)/ln(1.0001) ~= 487.9 -> 488
    expect(percentToTickHalfWidth(0.05)).toBe(488)
  })

  it('rejects non-positive percentages', () => {
    expect(() => percentToTickHalfWidth(0)).toThrow(/positive/)
    expect(() => percentToTickHalfWidth(-0.01)).toThrow(/positive/)
  })
})

describe('computeTickOccupancy', () => {
  it('counts observations within each band around the current tick', () => {
    // current tick 0; ±1% band is [-100, 100]
    const ticks = [-250, -50, 0, 50, 300]
    const result = computeTickOccupancy(ticks, 0, [0.01, 0.05])

    expect(result.sampleCount).toBe(5)
    const band1 = result.bands.find((band) => band.label === '±1%')!
    expect(band1.lowerTick).toBe(-100)
    expect(band1.upperTick).toBe(100)
    expect(band1.observationsInRange).toBe(3) // -50, 0, 50
    expect(band1.occupancyDecimal).toBe('0.600000') // 3/5

    const band5 = result.bands.find((band) => band.label === '±5%')!
    // ±5% band is [-488, 488] -> all 5 in range
    expect(band5.observationsInRange).toBe(5)
    expect(band5.occupancyDecimal).toBe('1.000000')
  })

  it('reports zero occupancy without dividing by zero when there are no observations', () => {
    const result = computeTickOccupancy([], 0, [0.01])
    expect(result.sampleCount).toBe(0)
    expect(result.bands[0]!.observationsInRange).toBe(0)
    expect(result.bands[0]!.occupancyDecimal).toBe('0.000000')
  })

  it('includes ticks exactly on the band boundary', () => {
    const result = computeTickOccupancy([-100, 100], 0, [0.01])
    expect(result.bands[0]!.observationsInRange).toBe(2)
  })
})
