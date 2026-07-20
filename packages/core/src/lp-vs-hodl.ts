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