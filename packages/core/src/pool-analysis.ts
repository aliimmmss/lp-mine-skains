import type { DataQuality, TokenRef } from './index.js'

const Q192 = 1n << 192n
const FEE_DENOMINATOR = 1_000_000n

export type ExactRatio = {
  numerator: bigint
  denominator: bigint
}

export type PoolAnalysisInput = {
  poolAddress: `0x${string}`
  token0: TokenRef
  token1: TokenRef
  feeTier: number
  sqrtPriceX96: bigint
  activeLiquidity: bigint
  observedAt: Date
  quality: DataQuality
  warnings: readonly string[]
}

export type PoolRiskFlag = 'zero-active-liquidity' | 'stale-snapshot' | 'incomplete-source'

export type PoolAnalysis = {
  poolAddress: `0x${string}`
  pair: string
  feeTier: number
  feeRate: ExactRatio
  token1PerToken0: ExactRatio
  token1PerToken0Decimal: string
  activeLiquidity: bigint
  observedAt: Date
  ageSeconds: number
  quality: DataQuality
  riskFlags: readonly PoolRiskFlag[]
  warnings: readonly string[]
  rankingBasis: 'active-liquidity-only'
}

export type PoolAnalysisOptions = {
  now?: Date
  staleAfterSeconds?: number
  decimalPlaces?: number
}

export type PoolComparisonReport = {
  pair: string
  generatedAt: Date
  rankingBasis: 'active-liquidity-only'
  disclaimer: string
  pools: readonly PoolAnalysis[]
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left
  let b = right < 0n ? -right : right
  while (b !== 0n) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

function reduceRatio(numerator: bigint, denominator: bigint): ExactRatio {
  if (denominator <= 0n) throw new RangeError('Ratio denominator must be positive')
  const divisor = greatestCommonDivisor(numerator, denominator)
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}

function powerOfTen(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0) throw new RangeError('Token decimals must be a non-negative integer')
  return 10n ** BigInt(exponent)
}

export function sqrtPriceX96ToToken1PerToken0(
  sqrtPriceX96: bigint,
  token0Decimals: number,
  token1Decimals: number,
): ExactRatio {
  if (sqrtPriceX96 <= 0n) throw new RangeError('sqrtPriceX96 must be positive')
  const numerator = sqrtPriceX96 * sqrtPriceX96 * powerOfTen(token0Decimals)
  const denominator = Q192 * powerOfTen(token1Decimals)
  return reduceRatio(numerator, denominator)
}

export function formatRatio(ratio: ExactRatio, decimalPlaces = 8): string {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 30) {
    throw new RangeError('decimalPlaces must be an integer between 0 and 30')
  }
  if (ratio.denominator <= 0n) throw new RangeError('Ratio denominator must be positive')

  const negative = ratio.numerator < 0n
  const numerator = negative ? -ratio.numerator : ratio.numerator
  const integerPart = numerator / ratio.denominator
  const sign = negative && numerator !== 0n ? '-' : ''
  if (decimalPlaces === 0) return `${sign}${integerPart}`

  const scale = powerOfTen(decimalPlaces)
  const fractionalPart = ((numerator % ratio.denominator) * scale) / ratio.denominator
  return `${sign}${integerPart}.${fractionalPart.toString().padStart(decimalPlaces, '0')}`
}

export function analyzePool(input: PoolAnalysisInput, options: PoolAnalysisOptions = {}): PoolAnalysis {
  if (input.feeTier < 0 || !Number.isInteger(input.feeTier))
    throw new RangeError('feeTier must be a non-negative integer')
  if (input.activeLiquidity < 0n) throw new RangeError('activeLiquidity must be non-negative')
  if (Number.isNaN(input.observedAt.getTime())) throw new RangeError('observedAt must be valid')

  const now = options.now ?? new Date()
  const staleAfterSeconds = options.staleAfterSeconds ?? 300
  if (!Number.isFinite(staleAfterSeconds) || staleAfterSeconds < 0) {
    throw new RangeError('staleAfterSeconds must be non-negative')
  }

  const ageSeconds = Math.max(0, Math.floor((now.getTime() - input.observedAt.getTime()) / 1_000))
  const riskFlags: PoolRiskFlag[] = []
  const warnings = [...input.warnings]

  if (input.activeLiquidity === 0n) {
    riskFlags.push('zero-active-liquidity')
    warnings.push('Pool reports zero active liquidity at the observed tick')
  }
  if (ageSeconds > staleAfterSeconds || input.quality === 'stale') {
    riskFlags.push('stale-snapshot')
    warnings.push(`Snapshot age ${ageSeconds}s exceeds the ${staleAfterSeconds}s freshness threshold`)
  }
  if (input.quality !== 'complete') riskFlags.push('incomplete-source')

  const token1PerToken0 = sqrtPriceX96ToToken1PerToken0(
    input.sqrtPriceX96,
    input.token0.decimals,
    input.token1.decimals,
  )

  return {
    poolAddress: input.poolAddress,
    pair: `${input.token0.symbol}/${input.token1.symbol}`,
    feeTier: input.feeTier,
    feeRate: reduceRatio(BigInt(input.feeTier), FEE_DENOMINATOR),
    token1PerToken0,
    token1PerToken0Decimal: formatRatio(token1PerToken0, options.decimalPlaces ?? 8),
    activeLiquidity: input.activeLiquidity,
    observedAt: input.observedAt,
    ageSeconds,
    quality: input.quality,
    riskFlags,
    warnings,
    rankingBasis: 'active-liquidity-only',
  }
}

export function compareFeeTierPools(
  inputs: readonly PoolAnalysisInput[],
  options: PoolAnalysisOptions = {},
): PoolComparisonReport {
  if (inputs.length === 0) throw new RangeError('At least one pool is required')
  const pair = `${inputs[0]!.token0.symbol}/${inputs[0]!.token1.symbol}`
  for (const input of inputs) {
    const candidatePair = `${input.token0.symbol}/${input.token1.symbol}`
    if (candidatePair !== pair) throw new RangeError('All pools must use the same ordered token pair')
  }

  const pools = inputs
    .map((input) => analyzePool(input, options))
    .sort((left, right) => {
      if (left.activeLiquidity === right.activeLiquidity) return left.feeTier - right.feeTier
      return left.activeLiquidity > right.activeLiquidity ? -1 : 1
    })

  return {
    pair,
    generatedAt: options.now ?? new Date(),
    rankingBasis: 'active-liquidity-only',
    disclaimer: 'Active liquidity is a depth signal, not an estimate of fees, APR, or LP profitability.',
    pools,
  }
}
