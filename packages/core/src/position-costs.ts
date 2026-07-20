import type { LpVsHodlAnalysis } from './lp-vs-hodl.js'
import type { ExactRatio } from './pool-analysis.js'

export type PositionCostCategory = 'gas' | 'slippage' | 'rebalance' | 'other'

export type PositionCostEntry = {
  category: PositionCostCategory
  amount0: bigint
  amount1: bigint
}

export type PositionCostBreakdown = PositionCostEntry & {
  valueToken1BaseUnits: ExactRatio
}

export type PositionCostAccountingInput = {
  accounting: LpVsHodlAnalysis
  costs: readonly PositionCostEntry[]
}

export type PositionCostAccounting = {
  grossNetVsHodlToken1BaseUnits: ExactRatio
  costs: readonly PositionCostBreakdown[]
  totalCostToken1BaseUnits: ExactRatio
  netAfterCostsVsHodlToken1BaseUnits: ExactRatio
  disclaimer: string
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left
  let b = right < 0n ? -right : right
  while (b !== 0n) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

function ratio(numerator: bigint, denominator: bigint): ExactRatio {
  if (denominator <= 0n) throw new RangeError('Ratio denominator must be positive')
  if (numerator === 0n) return { numerator: 0n, denominator: 1n }
  const divisor = gcd(numerator, denominator)
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}

function add(left: ExactRatio, right: ExactRatio): ExactRatio {
  return ratio(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  )
}

function subtract(left: ExactRatio, right: ExactRatio): ExactRatio {
  return ratio(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  )
}

function costValue(entry: PositionCostEntry, price: ExactRatio): ExactRatio {
  return add(ratio(entry.amount1, 1n), ratio(entry.amount0 * price.numerator, price.denominator))
}

export function applyPositionCosts(input: PositionCostAccountingInput): PositionCostAccounting {
  const costs = input.costs.map((entry) => {
    if (entry.amount0 < 0n || entry.amount1 < 0n) throw new RangeError('Position costs must be non-negative')
    return {
      ...entry,
      valueToken1BaseUnits: costValue(entry, input.accounting.exitPriceToken1PerToken0),
    }
  })
  const totalCostToken1BaseUnits = costs.reduce((total, entry) => add(total, entry.valueToken1BaseUnits), ratio(0n, 1n))

  return {
    grossNetVsHodlToken1BaseUnits: input.accounting.netVsHodlToken1BaseUnits,
    costs,
    totalCostToken1BaseUnits,
    netAfterCostsVsHodlToken1BaseUnits: subtract(input.accounting.netVsHodlToken1BaseUnits, totalCostToken1BaseUnits),
    disclaimer:
      'Costs are externally supplied evidence valued at the exit pool price. This overlay does not infer gas, slippage, rebalancing, taxes, incentives, or execution quality.',
  }
}
