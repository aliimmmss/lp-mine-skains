import type { TokenRef } from './index.js'
import type { ExactRatio } from './pool-analysis.js'

const Q96 = 1n << 96n
const Q192 = 1n << 192n
const Q128 = 1n << 128n
const MAX_UINT256 = (1n << 256n) - 1n

export const MIN_UNISWAP_V3_TICK = -887_272
export const MAX_UNISWAP_V3_TICK = 887_272
export const MIN_UNISWAP_V3_SQRT_PRICE_X96 = 4_295_128_739n
export const MAX_UNISWAP_V3_SQRT_PRICE_X96 = 1_461