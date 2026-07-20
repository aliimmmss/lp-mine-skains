import type { TokenRef } from './index.js'
import type { LpVsHodlAnalysis, PositionInventory } from './lp-vs-hodl.js'
import type { ExactRatio } from './pool-analysis.js'
import { formatRatio } from './pool-analysis.js'
import type { PositionCostAccounting } from './position-costs.js'
import type { PositionHistoryAnalysis } from './position-history.js'

export type PositionInventoryDisplay = {
  amount0: string
  amount1: string
}

export type LpVsHodlDisplay = {
  pair: string
  token0Symbol: string
  token1Symbol: string
  entryInventory: PositionInventoryDisplay
  exitInventory: PositionInventoryDisplay
  fees: PositionInventoryDisplay
  exitInventoryWithFees: PositionInventoryDisplay
  exitPriceToken1PerToken0: string
  token1Values: {
    lpPrincipal: string
    hodl: string
    divergence: string
    divergenceLoss: string
    fees: string
    lpWithFees: string
    netVsHodl: string
  }
}

export type PositionCostAccountingDisplay = {
  costs: readonly {
    category: string
    amount0: string
    amount1: string
    valueToken1: string
  }[]
  grossNetVsHodlToken1: string
  totalCostToken1: string
  netAfterCostsVsHodlToken1: string
}

export type PositionHistoryDisplay = {
  timeInRange: string
  inventoryTurnover0: string
  inventoryTurnover1: string
  maximumDrawdownToken1: string
  maximumDrawdownRate: string
  finalAccounting: LpVsHodlDisplay
}

function validateDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new RangeError('Token decimals must be an integer between 0 and 255')
  }
}

function tokenUnits(value: ExactRatio, decimals: number): ExactRatio {
  validateDecimals(decimals)
  return { numerator: value.numerator, denominator: value.denominator * 10n ** BigInt(decimals) }
}

export function formatTokenAmountBaseUnits(amount: bigint, decimals: number): string {
  validateDecimals(decimals)
  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  if (decimals === 0) return `${negative ? '-' : ''}${absolute}`

  const scale = 10n ** BigInt(decimals)
  const integerPart = absolute / scale
  const fraction = (absolute % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${integerPart}${fraction.length > 0 ? `.${fraction}` : ''}`
}

export function formatTokenValueBaseUnits(
  value: ExactRatio,
  decimals: number,
  decimalPlaces = Math.min(decimals, 30),
): string {
  return formatRatio(tokenUnits(value, decimals), decimalPlaces)
}

export function formatHumanTokenPrice(
  rawBaseUnitPrice: ExactRatio,
  token0Decimals: number,
  token1Decimals: number,
  decimalPlaces = 8,
): string {
  validateDecimals(token0Decimals)
  validateDecimals(token1Decimals)
  return formatRatio(
    {
      numerator: rawBaseUnitPrice.numerator * 10n ** BigInt(token0Decimals),
      denominator: rawBaseUnitPrice.denominator * 10n ** BigInt(token1Decimals),
    },
    decimalPlaces,
  )
}

function inventoryDisplay(inventory: PositionInventory, token0: TokenRef, token1: TokenRef): PositionInventoryDisplay {
  return {
    amount0: formatTokenAmountBaseUnits(inventory.amount0, token0.decimals),
    amount1: formatTokenAmountBaseUnits(inventory.amount1, token1.decimals),
  }
}

export function formatLpVsHodlAnalysis(
  accounting: LpVsHodlAnalysis,
  token0: TokenRef,
  token1: TokenRef,
): LpVsHodlDisplay {
  return {
    pair: accounting.pair,
    token0Symbol: token0.symbol,
    token1Symbol: token1.symbol,
    entryInventory: inventoryDisplay(accounting.entryInventory, token0, token1),
    exitInventory: inventoryDisplay(accounting.exitInventory, token0, token1),
    fees: inventoryDisplay(accounting.fees, token0, token1),
    exitInventoryWithFees: inventoryDisplay(accounting.exitInventoryWithFees, token0, token1),
    exitPriceToken1PerToken0: formatHumanTokenPrice(
      accounting.exitPriceToken1PerToken0,
      token0.decimals,
      token1.decimals,
    ),
    token1Values: {
      lpPrincipal: formatTokenValueBaseUnits(accounting.lpPrincipalValueToken1BaseUnits, token1.decimals),
      hodl: formatTokenValueBaseUnits(accounting.hodlValueToken1BaseUnits, token1.decimals),
      divergence: formatTokenValueBaseUnits(accounting.divergenceToken1BaseUnits, token1.decimals),
      divergenceLoss: formatTokenValueBaseUnits(accounting.divergenceLossToken1BaseUnits, token1.decimals),
      fees: formatTokenValueBaseUnits(accounting.feeValueToken1BaseUnits, token1.decimals),
      lpWithFees: formatTokenValueBaseUnits(accounting.lpValueWithFeesToken1BaseUnits, token1.decimals),
      netVsHodl: formatTokenValueBaseUnits(accounting.netVsHodlToken1BaseUnits, token1.decimals),
    },
  }
}

export function formatPositionCostAccounting(
  accounting: PositionCostAccounting,
  token0: TokenRef,
  token1: TokenRef,
): PositionCostAccountingDisplay {
  return {
    costs: accounting.costs.map((cost) => ({
      category: cost.category,
      amount0: formatTokenAmountBaseUnits(cost.amount0, token0.decimals),
      amount1: formatTokenAmountBaseUnits(cost.amount1, token1.decimals),
      valueToken1: formatTokenValueBaseUnits(cost.valueToken1BaseUnits, token1.decimals),
    })),
    grossNetVsHodlToken1: formatTokenValueBaseUnits(accounting.grossNetVsHodlToken1BaseUnits, token1.decimals),
    totalCostToken1: formatTokenValueBaseUnits(accounting.totalCostToken1BaseUnits, token1.decimals),
    netAfterCostsVsHodlToken1: formatTokenValueBaseUnits(
      accounting.netAfterCostsVsHodlToken1BaseUnits,
      token1.decimals,
    ),
  }
}

export function formatPositionHistoryAnalysis(
  analysis: PositionHistoryAnalysis,
  token0: TokenRef,
  token1: TokenRef,
): PositionHistoryDisplay {
  const finalPoint = analysis.points.at(-1)
  if (!finalPoint) throw new RangeError('Position history requires a final accounting point')
  return {
    timeInRange: formatRatio(analysis.timeInRange, 6),
    inventoryTurnover0: formatTokenAmountBaseUnits(analysis.inventoryTurnover0BaseUnits, token0.decimals),
    inventoryTurnover1: formatTokenAmountBaseUnits(analysis.inventoryTurnover1BaseUnits, token1.decimals),
    maximumDrawdownToken1: formatTokenValueBaseUnits(analysis.maximumDrawdownToken1BaseUnits, token1.decimals),
    maximumDrawdownRate: formatRatio(analysis.maximumDrawdownRate, 6),
    finalAccounting: formatLpVsHodlAnalysis(finalPoint.accounting, token0, token1),
  }
}
