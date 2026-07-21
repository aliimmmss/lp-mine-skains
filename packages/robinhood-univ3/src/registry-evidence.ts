import { getAddress, keccak256, type Address, type Hex } from 'viem'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_TOKENS, ROBINHOOD_UNISWAP_V3, ROBINHOOD_WETH_USDG_POOLS } from './registry.js'

export type RobinhoodRegistryRole = 'factory' | 'position-manager' | 'token' | 'pool'

export type RobinhoodRegistryBytecodeEvidence = Readonly<{
  name: string
  role: RobinhoodRegistryRole
  address: Address
  byteLength: number
  bytecodeHash: Hex
  readEligible: true
  executionEligible: false
}>

export type RegistryBytecodeVerificationStatus = 'verified' | 'unregistered' | 'missing-code' | 'hash-mismatch'

export type RegistryBytecodeVerification = Readonly<{
  status: RegistryBytecodeVerificationStatus
  address: Address
  expectedHash: Hex | null
  actualHash: Hex | null
  expectedByteLength: number | null
  actualByteLength: number | null
}>

const entries = Object.freeze([
  Object.freeze({
    name: 'factory',
    role: 'factory',
    address: ROBINHOOD_UNISWAP_V3.factory,
    byteLength: 24_535,
    bytecodeHash: '0xec72b1abd1f2faee020cfea9c646bd8994f9fb389054f6e574f103a895091739',
    readEligible: true,
    executionEligible: false,
  }),
  Object.freeze({
    name: 'positionManager',
    role: 'position-manager',
    address: ROBINHOOD_UNISWAP_V3.positionManager,
    byteLength: 24_384,
    bytecodeHash: '0x0a493d1af3d0f25fed8efa205244ebee14114267a08647fc38c515c7cd6ead4f',
    readEligible: true,
    executionEligible: false,
  }),
  Object.freeze({
    name: 'wrappedNative',
    role: 'token',
    address: ROBINHOOD_TOKENS.wrappedNative,
    byteLength: 2_202,
    bytecodeHash: '0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353',
    readEligible: true,
    executionEligible: false,
  }),
  Object.freeze({
    name: 'usdg',
    role: 'token',
    address: ROBINHOOD_TOKENS.usdg,
    byteLength: 170,
    bytecodeHash: '0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6',
    readEligible: true,
    executionEligible: false,
  }),
  Object.freeze({
    name: 'pool-100',
    role: 'pool',
    address: ROBINHOOD_WETH_USDG_POOLS[0].poolAddress,
    byteLength: 22_142,
    bytecodeHash: '0x3298b5dd4e6f115074c526a55ad05a36fd73a0034ac22ec6cbaab32cc9c1e8d2',
    readEligible: true,
    executionEligible: false,
  }),
  Object.freeze({
    name: 'pool-500',
    role: 'pool',
    address: ROBINHOOD_WETH_USDG_POOLS[1].poolAddress,
    byteLength: 22_142,
    bytecodeHash: '0x74a16c3b1b4ac8903c54a9edad666d4c87512cb78ed0723538acd84d1b56c5b5',
    readEligible: true,
    executionEligible: false,
  }),
  Object.freeze({
    name: 'pool-3000',
    role: 'pool',
    address: ROBINHOOD_WETH_USDG_POOLS[2].poolAddress,
    byteLength: 22_142,
    bytecodeHash: '0x0fc31cfc533a5922261eaa33ff62c43ffd3839dc5204fb6dbbe6effd7bd9d63d',
    readEligible: true,
    executionEligible: false,
  }),
  Object.freeze({
    name: 'pool-10000',
    role: 'pool',
    address: ROBINHOOD_WETH_USDG_POOLS[3].poolAddress,
    byteLength: 22_142,
    bytecodeHash: '0xe20600974a722992eb4622b85b2a77ccac5e4aaa2f781bd93cae4334ca18d686',
    readEligible: true,
    executionEligible: false,
  }),
] satisfies readonly RobinhoodRegistryBytecodeEvidence[])

export const ROBINHOOD_REGISTRY_EVIDENCE = Object.freeze({
  status: 'read-only-verified' as const,
  chainId: ROBINHOOD_CHAIN_ID,
  reviewedAt: '2026-07-21T09:06:13.519Z',
  auditRunId: '29816884050',
  auditCommit: '388ca3f0a8d576cc0615f9d8fa330ce76b09243f',
  sourceAgreement: true,
  executionEligible: false as const,
  executionBlockers: Object.freeze([
    'WETH allowance revocation is provisionally selected for design review but is not approved or execution-eligible.',
    'Allowed write selectors and argument policies are not pinned in executable policy.',
    'WETH is upgradeable and its ultimate proxy administration chain remains unresolved.',
    'Simulation, review-screen, cancellation, receipt reconciliation, and incident-disable policies are not implemented.',
  ]),
  references: Object.freeze([
    'https://docs.robinhood.com/chain/connecting/',
    'https://docs.robinhood.com/chain/contracts/',
    'https://github.com/aliimmmss/lp-mine-skains/issues/54#issuecomment-5032123113',
    'https://github.com/aliimmmss/lp-mine-skains/issues/62',
  ]),
  entries,
})

export function registryEvidenceForAddress(address: Address): RobinhoodRegistryBytecodeEvidence | null {
  const normalized = getAddress(address)
  return ROBINHOOD_REGISTRY_EVIDENCE.entries.find((entry) => entry.address === normalized) ?? null
}

export function verifyBytecodeEvidence(
  evidence: Pick<RobinhoodRegistryBytecodeEvidence, 'address' | 'byteLength' | 'bytecodeHash'>,
  bytecode: Hex | undefined,
): RegistryBytecodeVerification {
  if (bytecode === undefined || bytecode === '0x') {
    return {
      status: 'missing-code',
      address: evidence.address,
      expectedHash: evidence.bytecodeHash,
      actualHash: null,
      expectedByteLength: evidence.byteLength,
      actualByteLength: 0,
    }
  }

  const actualHash = keccak256(bytecode)
  const actualByteLength = (bytecode.length - 2) / 2
  return {
    status:
      actualHash === evidence.bytecodeHash && actualByteLength === evidence.byteLength ? 'verified' : 'hash-mismatch',
    address: evidence.address,
    expectedHash: evidence.bytecodeHash,
    actualHash,
    expectedByteLength: evidence.byteLength,
    actualByteLength,
  }
}

export function verifyRobinhoodRegistryBytecode(
  address: Address,
  bytecode: Hex | undefined,
): RegistryBytecodeVerification {
  const normalized = getAddress(address)
  const evidence = registryEvidenceForAddress(normalized)
  if (evidence === null) {
    return {
      status: 'unregistered',
      address: normalized,
      expectedHash: null,
      actualHash: bytecode && bytecode !== '0x' ? keccak256(bytecode) : null,
      expectedByteLength: null,
      actualByteLength: bytecode && bytecode !== '0x' ? (bytecode.length - 2) / 2 : 0,
    }
  }
  return verifyBytecodeEvidence(evidence, bytecode)
}

export function assertVerifiedRobinhoodRegistryBytecode(address: Address, bytecode: Hex | undefined): void {
  const result = verifyRobinhoodRegistryBytecode(address, bytecode)
  if (result.status !== 'verified') {
    throw new Error(`Registry bytecode verification failed for ${result.address}: ${result.status}`)
  }
}
