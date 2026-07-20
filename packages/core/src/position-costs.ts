import type { LpVsHodlAnalysis } from './lp-vs-hodl.js'
import type { ExactRatio } from './pool-analysis.js'

export type PositionEvidenceProvenance = {
  source: string
  observedAt: Date
  reference?: string
}

export type PositionCostCategory = 'gas' | 'slippage' | 'rebalance' | 'other'

export type PositionCostEntry = {
  category: PositionCostCategory
  amount0: bigint
  amount1: bigint
  provenance?: PositionEvidenceProvenance
}

export type PositionCostBreakdown = PositionCostEntry & {
  valueToken1BaseUnits: ExactRatio
  evidenceQuality: 'complete' | 'partial'
  warnings: readonly string[]
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
  evidenceQuality: 'complete' | 'partial'
  warnings: readonly string[]
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

function validateProvenance(provenance: PositionEvidenceProvenance | undefined, label: string): readonly string[] {
  if (!provenance) return [`${label} has no provenance source or observation timestamp.`]
  if (provenance.source.trim().length === 0) throw new RangeError(`${label} provenance source must not be empty`)
  if (Number.isNaN(provenance.observedAt.getTime())) throw new RangeError(`${label} provenance observedAt must be valid`)
  if (provenance.reference !== undefined && provenance.reference.trim().length === 0) {
    throw new RangeError(`${label} provenance reference must not be empty when supplied`)
  }
  return []
}

export function applyPositionCosts(input: PositionCostAccountingInput): PositionCostAccounting {
  const costs = input.costs.map((entry) => {
    if (entry.amount0 < 0n || entry.amount1 < 0n) throw new RangeError('Position costs must be non-negative')
    const warnings = validateProvenance(entry.provenance, `${entry.category} cost`)
    return {
      ...entry,
      valueToken1BaseUnits: costValue(entry, input.accounting.exitPriceToken1PerToken0),
      evidenceQuality: warnings.length === 0 ? ('complete' as const) : ('partial' as const),
      warnings,
    }
  })
  const totalCostToken1BaseUnits = costs.reduce((total, entry) => add(total, entry.valueToken1BaseUnits), ratio(0n, 1n))
  const warnings = costs.flatMap((entry) => entry.warnings)

  return {
    grossNetVsHodlToken1BaseUnits: input.accounting.netVsHodlToken1BaseUnits,
    costs,
    totalCostToken1BaseUnits,
    netAfterCostsVsHodlToken1BaseUnits: subtract(input.accounting.netVsHodlToken1BaseUnits, totalCostToken1BaseUnits),
    evidenceQuality: warnings.length === 0 ? 'complete' : 'partial',
    warnings,
    disclaimer:
      'Costs are externally supplied evidence valued at the exit pool price. Complete evidence records a source and observation timestamp; references remain optional. This overlay does not infer gas, slippage, rebalancing, taxes, incentives, or execution quality.',
  }
}
