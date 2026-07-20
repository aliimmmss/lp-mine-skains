import type { TokenRef } from './index.js'
import { formatRatio, type ExactRatio } from './pool-analysis.js'

const FEE_DENOMINATOR = 1_000_000n

export type SwapEvidenceObservationInput = {
  blockNumber: bigint
  observedAt: Date
  amount0: bigint
  amount1: bigint
}

export type SwapEvidenceInput = {
  poolAddress: `0x${string}`
  token0: TokenRef
  token1: TokenRef
  quoteToken: 'token0' | 'token1'
  feeTier: number
  observations: readonly SwapEvidenceObservationInput[]
}

export type NominalFeeEvidence = {
  exactBaseUnits: ExactRatio
  floorBaseUnits: bigint
  ceilingBaseUnits: bigint
  floorDecimal: string
  ceilingDecimal: string
}

export type TokenFlowEvidence = {
  symbol: string
  decimals: number
  inputBaseUnits: bigint
  outputBaseUnits: bigint
  absoluteMovementBaseUnits: bigint
  inputDecimal: string
  outputDecimal: string
  absoluteMovementDecimal: string
  nominalGrossFee: NominalFeeEvidence
}

export type SwapEvidenceAnalysis = {
  poolAddress: `0x${string}`
  pair: string
  feeTier: number
  feeRate: ExactRatio
  swapCount: number
  token0InputSwapCount: number
  token1InputSwapCount: number
  firstBlock: bigint
  lastBlock: bigint
  firstObservedAt: Date
  lastObservedAt: Date
  token0: TokenFlowEvidence
  token1: TokenFlowEvidence
  quoteNotionalBaseUnits: bigint
  quoteNotionalDecimal: string
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

function powerOfTen(decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) throw new RangeError('Token decimals must be non-negative')
  return 10n ** BigInt(decimals)
}

function decimal(baseUnits: bigint, decimals: number, decimalPlaces = decimals): string {
  return formatRatio(ratio(baseUnits, powerOfTen(decimals)), Math.min(decimalPlaces, 30))
}

function nominalFee(inputBaseUnits: bigint, feeTier: number, decimals: number): NominalFeeEvidence {
  const numerator = inputBaseUnits * BigInt(feeTier)
  const exactBaseUnits = ratio(numerator, FEE_DENOMINATOR)
  const floorBaseUnits = numerator / FEE_DENOMINATOR
  const ceilingBaseUnits = floorBaseUnits + (numerator % FEE_DENOMINATOR === 0n ? 0n : 1n)
  return {
    exactBaseUnits,
    floorBaseUnits,
    ceilingBaseUnits,
    floorDecimal: decimal(floorBaseUnits, decimals),
    ceilingDecimal: decimal(ceilingBaseUnits, decimals),
  }
}

function tokenFlow(
  token: TokenRef,
  inputBaseUnits: bigint,
  outputBaseUnits: bigint,
  feeTier: number,
): TokenFlowEvidence {
  const absoluteMovementBaseUnits = inputBaseUnits + outputBaseUnits
  return {
    symbol: token.symbol,
    decimals: token.decimals,
    inputBaseUnits,
    outputBaseUnits,
    absoluteMovementBaseUnits,
    inputDecimal: decimal(inputBaseUnits, token.decimals),
    outputDecimal: decimal(outputBaseUnits, token.decimals),
    absoluteMovementDecimal: decimal(absoluteMovementBaseUnits, token.decimals),
    nominalGrossFee: nominalFee(inputBaseUnits, feeTier, token.decimals),
  }
}

export function analyzeSwapEvidence(input: SwapEvidenceInput): SwapEvidenceAnalysis {
  if (!Number.isInteger(input.feeTier) || input.feeTier < 0 || input.feeTier >= Number(FEE_DENOMINATOR)) {
    throw new RangeError('feeTier must be an integer between 0 and 999999')
  }
  if (input.observations.length === 0) throw new RangeError('At least one swap observation is required')

  const observations = [...input.observations].sort((left, right) => {
    if (left.observedAt.getTime() !== right.observedAt.getTime()) return left.observedAt.getTime() - right.observedAt.getTime()
    return left.blockNumber < right.blockNumber ? -1 : left.blockNumber > right.blockNumber ? 1 : 0
  })

  let token0Input = 0n
  let token0Output = 0n
  let token1Input = 0n
  let token1Output = 0n
  let token0InputSwapCount = 0
  let token1InputSwapCount = 0

  for (const observation of observations) {
    if (Number.isNaN(observation.observedAt.getTime())) throw new RangeError('Swap timestamps must be valid')
    if (observation.amount0 === 0n && observation.amount1 === 0n) throw new RangeError('Swap token deltas cannot both be zero')
    if (observation.amount0 > 0n) {
      token0Input += observation.amount0
      token0InputSwapCount += 1
    } else {
      token0Output += -observation.amount0
    }
    if (observation.amount1 > 0n) {
      token1Input += observation.amount1
      token1InputSwapCount += 1
    } else {
      token1Output += -observation.amount1
    }
  }

  const first = observations[0]!
  const last = observations[observations.length - 1]!
  const quoteNotionalBaseUnits = input.quoteToken === 'token0' ? token0Input + token0Output : token1Input + token1Output
  const quote = input.quoteToken === 'token0' ? input.token0 : input.token1

  return {
    poolAddress: input.poolAddress,
    pair: `${input.token0.symbol}/${input.token1.symbol}`,
    feeTier: input.feeTier,
    feeRate: ratio(BigInt(input.feeTier), FEE_DENOMINATOR),
    swapCount: observations.length,
    token0InputSwapCount,
    token1InputSwapCount,
    firstBlock: first.blockNumber,
    lastBlock: last.blockNumber,
    firstObservedAt: first.observedAt,
    lastObservedAt: last.observedAt,
    token0: tokenFlow(input.token0, token0Input, token0Output, input.feeTier),
    token1: tokenFlow(input.token1, token1Input, token1Output, input.feeTier),
    quoteNotionalBaseUnits,
    quoteNotionalDecimal: decimal(quoteNotionalBaseUnits, quote.decimals),
    disclaimer:
      'Nominal gross fee evidence applies the pool fee rate to observed input flow. It is not collectible LP fees, fee share, APR, or profitability.',
  }
}
