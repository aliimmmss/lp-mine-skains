import type { TokenRef } from './index.js'
import type { ExactRatio } from './pool-analysis.js'

const Q32 = 1n << 32n
const Q96 = 1n << 96n
const Q192 = 1n << 192n
const MAX_UINT128 = (1n << 128n) - 1n
const MAX_UINT256 = (1n << 256n) - 1n
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

export const MIN_UNISWAP_V3_TICK = -887_272
export const MAX_UNISWAP_V3_TICK = 887_272
export const MIN_UNISWAP_V3_SQRT_RATIO_X96 = 4_295_128_739n
export const MAX_UNISWAP_V3_SQRT_RATIO_X96 = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n

export type PositionInventory = { amount0: bigint; amount1: bigint }

export type LpVsHodlInput = {
  token0: TokenRef
  token1: TokenRef
  tickLower: number
  tickUpper: number
  liquidity: bigint
  entrySqrtPriceX96: bigint
  exitSqrtPriceX96: bigint
  fees0?: bigint
  fees1?: bigint
}

export type LpVsHodlAnalysis = {
  pair: string
  entryInventory: PositionInventory
  exitInventory: PositionInventory
  fees: PositionInventory
  exitInventoryWithFees: PositionInventory
  exitPriceToken1PerToken0: ExactRatio
  lpPrincipalValueToken1BaseUnits: ExactRatio
  hodlValueToken1BaseUnits: ExactRatio
  divergenceToken1BaseUnits: ExactRatio
  divergenceLossToken1BaseUnits: ExactRatio
  feeValueToken1BaseUnits: ExactRatio
  lpValueWithFeesToken1BaseUnits: ExactRatio
  netVsHodlToken1BaseUnits: ExactRatio
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

function nonNegativeDifference(left: ExactRatio, right: ExactRatio): ExactRatio {
  const difference = subtract(left, right)
  return difference.numerator > 0n ? difference : ratio(0n, 1n)
}

function validateToken(token: TokenRef, name: string): void {
  if (!Number.isSafeInteger(token.chainId) || token.chainId <= 0)
    throw new RangeError(`${name}.chainId must be positive`)
  if (!ADDRESS_PATTERN.test(token.address)) throw new RangeError(`${name}.address must be a 20-byte hex address`)
  if (token.symbol.trim().length === 0) throw new RangeError(`${name}.symbol must not be empty`)
  if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255) {
    throw new RangeError(`${name}.decimals must be an integer between 0 and 255`)
  }
}

function validatePoolTokens(token0: TokenRef, token1: TokenRef): void {
  validateToken(token0, 'token0')
  validateToken(token1, 'token1')
  if (token0.chainId !== token1.chainId) throw new RangeError('token0 and token1 must use the same chainId')
  if (token0.address.toLowerCase() === token1.address.toLowerCase()) {
    throw new RangeError('token0 and token1 must be distinct tokens')
  }
}

function validateSqrtPriceX96(value: bigint, name: string): void {
  if (value < MIN_UNISWAP_V3_SQRT_RATIO_X96 || value >= MAX_UNISWAP_V3_SQRT_RATIO_X96) {
    throw new RangeError(`${name} is outside executable Uniswap v3 sqrt-price bounds`)
  }
}

function amount0ForLiquidity(lower: bigint, upper: bigint, liquidity: bigint): bigint {
  const numerator = (liquidity << 96n) * (upper - lower)
  return numerator / upper / lower
}

export function tickToSqrtPriceX96(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_UNISWAP_V3_TICK || tick > MAX_UNISWAP_V3_TICK) {
    throw new RangeError('Tick is outside Uniswap v3 bounds')
  }
  const absoluteTick = BigInt(tick < 0 ? -tick : tick)
  let result = (absoluteTick & 1n) !== 0n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 1n << 128n
  const factors: readonly [bigint, bigint][] = [
    [2n, 0xfff97272373d413259a46990580e213an],
    [4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
    [8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
    [16n, 0xffcb9843d60f6159c9db58835c926644n],
    [32n, 0xff973b41fa98c081472e6896dfb254c0n],
    [64n, 0xff2ea16466c96a3843ec78b326b52861n],
    [128n, 0xfe5dee046a99a2a811c461f1969c3053n],
    [256n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [512n, 0xf987a7253ac413176f2b074cf7815e54n],
    [1024n, 0xf3392b0822b70005940c7a398e4b70f3n],
    [2048n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
    [4096n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
    [8192n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
    [16384n, 0x70d869a156d2a1b890bb3df62baf32f7n],
    [32768n, 0x31be135f97d08fd981231505542fcfa6n],
    [65536n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [131072n, 0x5d6af8dedb81196699c329225ee604n],
    [262144n, 0x2216e584f5fa1ea926041bedfe98n],
    [524288n, 0x48a170391f7dc42444e8fa2n],
  ]
  for (const [mask, factor] of factors) {
    if ((absoluteTick & mask) !== 0n) result = (result * factor) >> 128n
  }
  if (tick > 0) result = MAX_UINT256 / result
  return (result >> 32n) + (result % Q32 === 0n ? 0n : 1n)
}

export function amountsForLiquidity(
  sqrtPriceX96: bigint,
  sqrtPriceLowerX96: bigint,
  sqrtPriceUpperX96: bigint,
  liquidity: bigint,
): PositionInventory {
  if (
    sqrtPriceLowerX96 < MIN_UNISWAP_V3_SQRT_RATIO_X96 ||
    sqrtPriceUpperX96 > MAX_UNISWAP_V3_SQRT_RATIO_X96 ||
    sqrtPriceLowerX96 >= sqrtPriceUpperX96
  ) {
    throw new RangeError('Invalid Uniswap v3 sqrt-price bounds')
  }
  if (sqrtPriceX96 < MIN_UNISWAP_V3_SQRT_RATIO_X96 || sqrtPriceX96 > MAX_UNISWAP_V3_SQRT_RATIO_X96) {
    throw new RangeError('sqrtPriceX96 is outside Uniswap v3 bounds')
  }
  if (liquidity < 0n || liquidity > MAX_UINT128) throw new RangeError('Liquidity must fit uint128')

  if (sqrtPriceX96 <= sqrtPriceLowerX96) {
    return { amount0: amount0ForLiquidity(sqrtPriceLowerX96, sqrtPriceUpperX96, liquidity), amount1: 0n }
  }
  if (sqrtPriceX96 < sqrtPriceUpperX96) {
    return {
      amount0: amount0ForLiquidity(sqrtPriceX96, sqrtPriceUpperX96, liquidity),
      amount1: (liquidity * (sqrtPriceX96 - sqrtPriceLowerX96)) / Q96,
    }
  }
  return { amount0: 0n, amount1: (liquidity * (sqrtPriceUpperX96 - sqrtPriceLowerX96)) / Q96 }
}

function token1Value(inventory: PositionInventory, sqrtPriceX96: bigint): ExactRatio {
  const price = ratio(sqrtPriceX96 * sqrtPriceX96, Q192)
  return add(ratio(inventory.amount1, 1n), ratio(inventory.amount0 * price.numerator, price.denominator))
}

export function analyzeLpVsHodl(input: LpVsHodlInput): LpVsHodlAnalysis {
  validatePoolTokens(input.token0, input.token1)
  if (
    !Number.isInteger(input.tickLower) ||
    !Number.isInteger(input.tickUpper) ||
    input.tickLower < MIN_UNISWAP_V3_TICK ||
    input.tickUpper > MAX_UNISWAP_V3_TICK ||
    input.tickLower >= input.tickUpper
  ) {
    throw new RangeError('tickLower and tickUpper must be ordered Uniswap v3 ticks')
  }
  if (input.liquidity <= 0n || input.liquidity > MAX_UINT128)
    throw new RangeError('Liquidity must be a positive uint128')
  if ((input.fees0 ?? 0n) < 0n || (input.fees1 ?? 0n) < 0n) throw new RangeError('Fees must be non-negative')
  validateSqrtPriceX96(input.entrySqrtPriceX96, 'entrySqrtPriceX96')
  validateSqrtPriceX96(input.exitSqrtPriceX96, 'exitSqrtPriceX96')

  const lower = tickToSqrtPriceX96(input.tickLower)
  const upper = tickToSqrtPriceX96(input.tickUpper)
  const entryInventory = amountsForLiquidity(input.entrySqrtPriceX96, lower, upper, input.liquidity)
  const exitInventory = amountsForLiquidity(input.exitSqrtPriceX96, lower, upper, input.liquidity)
  const fees = { amount0: input.fees0 ?? 0n, amount1: input.fees1 ?? 0n }
  const exitInventoryWithFees = {
    amount0: exitInventory.amount0 + fees.amount0,
    amount1: exitInventory.amount1 + fees.amount1,
  }
  const lpPrincipalValueToken1BaseUnits = token1Value(exitInventory, input.exitSqrtPriceX96)
  const hodlValueToken1BaseUnits = token1Value(entryInventory, input.exitSqrtPriceX96)
  const divergenceToken1BaseUnits = subtract(lpPrincipalValueToken1BaseUnits, hodlValueToken1BaseUnits)
  const feeValueToken1BaseUnits = token1Value(fees, input.exitSqrtPriceX96)
  const lpValueWithFeesToken1BaseUnits = add(lpPrincipalValueToken1BaseUnits, feeValueToken1BaseUnits)

  return {
    pair: `${input.token0.symbol}/${input.token1.symbol}`,
    entryInventory,
    exitInventory,
    fees,
    exitInventoryWithFees,
    exitPriceToken1PerToken0: ratio(input.exitSqrtPriceX96 * input.exitSqrtPriceX96, Q192),
    lpPrincipalValueToken1BaseUnits,
    hodlValueToken1BaseUnits,
    divergenceToken1BaseUnits,
    divergenceLossToken1BaseUnits: nonNegativeDifference(hodlValueToken1BaseUnits, lpPrincipalValueToken1BaseUnits),
    feeValueToken1BaseUnits,
    lpValueWithFeesToken1BaseUnits,
    netVsHodlToken1BaseUnits: subtract(lpValueWithFeesToken1BaseUnits, hodlValueToken1BaseUnits),
    disclaimer:
      'This deterministic accounting uses canonical integer-floor position math. It excludes gas, slippage, rebalancing, incentives, protocol fees, taxes, and execution risk. Supplied fees are external evidence.',
  }
}
