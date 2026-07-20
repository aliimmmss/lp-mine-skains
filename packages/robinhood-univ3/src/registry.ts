import { getAddress, type Address } from 'viem'

export const ROBINHOOD_CHAIN_ID = 4663 as const

export const ROBINHOOD_UNISWAP_V3 = Object.freeze({
  chainId: ROBINHOOD_CHAIN_ID,
  factory: getAddress('0x1f7d7550B1b028f7571E69A784071F0205FD2EfA'),
  positionManager: getAddress('0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3'),
  wrappedNative: getAddress('0x0Bd7D308f8E1639F