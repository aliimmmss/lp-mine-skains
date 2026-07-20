import { getAddress, type Address } from 'viem'

export const ROBINHOOD_CHAIN_ID = 4663 as const

export const ROBINHOOD_UNISWAP_V3 = Object.freeze({
  chainId: ROBINHOOD_CHAIN_ID,
  factory: getAddress('0x1f7d7550B1b028f7571E69A784071F0205FD2EfA'),
  positionManager: getAddress('0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3'),
  wrappedNative: getAddress('0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'),
  publicRpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
}) satisfies Readonly<{
  chainId: typeof ROBINHOOD_CHAIN_ID
  factory: Address
  positionManager: Address
  wrappedNative: Address
  publicRpcUrl: string
}>

export const ROBINHOOD_TOKENS = Object.freeze({
  wrappedNative: ROBINHOOD_UNISWAP_V3.wrappedNative,
  usdg: getAddress('0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'),
}) satisfies Readonly<{
  wrappedNative: Address
  usdg: Address
}>

export const SUPPORTED_FEE_TIERS = Object.freeze([100, 500, 3000, 10_000] as const)
export type SupportedFeeTier = (typeof SUPPORTED_FEE_TIERS)[number]

export const ROBINHOOD_WETH_USDG_POOLS = Object.freeze([
  {
    feeTier: 100,
    tickSpacing: 1,
    poolAddress: getAddress('0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca'),
  },
  {
    feeTier: 500,
    tickSpacing: 10,
    poolAddress: getAddress('0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a'),
  },
  {
    feeTier: 3_000,
    tickSpacing: 60,
    poolAddress: getAddress('0xa9188730Fe85Be88ad499D7d52B099e800fB0334'),
  },
  {
    feeTier: 10_000,
    tickSpacing: 200,
    poolAddress: getAddress('0x5f009E071F07e92B6C624e83F52F17bBDa34680D'),
  },
] as const)

export function isSupportedFeeTier(value: number): value is SupportedFeeTier {
  return SUPPORTED_FEE_TIERS.some((fee) => fee === value)
}
