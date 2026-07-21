import { getAddress, type Address, type Hex } from 'viem'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_TOKENS } from './registry.js'

export type WethProxyCodeEvidence = Readonly<{
  address: Address
  byteLength: number
  bytecodeHash: Hex
}>

export type WethProxyObservedState = Readonly<{
  chainId: number
  proxy: WethProxyCodeEvidence
  implementation: WethProxyCodeEvidence
  admin: WethProxyCodeEvidence
  beacon: Address | null
  adminOwner: WethProxyCodeEvidence
}>

export type WethProxyEvidenceCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethProxyEvidenceVerification = Readonly<{
  status: 'verified-read-only' | 'mismatch'
  executionEligible: false
  checks: readonly WethProxyEvidenceCheck[]
}>

export const ROBINHOOD_WETH_PROXY_EVIDENCE = Object.freeze({
  status: 'read-only-verified-upgradeable' as const,
  chainId: ROBINHOOD_CHAIN_ID,
  sharedBlock: 15_484_005n,
  reviewedAt: '2026-07-21T10:16:25.029Z',
  auditRunIds: Object.freeze(['29821192934', '29821568270']),
  sourceAgreement: true,
  proxyType: 'transparent-eip1967' as const,
  proxy: Object.freeze({
    address: ROBINHOOD_TOKENS.wrappedNative,
    byteLength: 2_202,
    bytecodeHash: '0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353' as Hex,
    source: Object.freeze({
      name: 'TransparentUpgradeableProxy',
      compilerVersion: 'v0.8.16+commit.07a7930e',
      optimizationEnabled: true,
      optimizationRuns: 100,
      evmVersion: 'london',
      filePath: '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
      blockscoutVerified: true,
      sourceLength: 8_279,
      sourceSha256: '0xbe83b87e6f2dbc5d0dea923bb45092689382f1580893dfda28438452ffa10e88' as Hex,
    }),
  }),
  implementation: Object.freeze({
    address: getAddress('0xC6B81b429797E0f555440b70cD99e032D7AE947e'),
    byteLength: 6_961,
    bytecodeHash: '0xbe1295f37be34ffe03ad779bda0ef278907e1856b51a3be2f35ee541d75d4650' as Hex,
    source: Object.freeze({
      name: 'aeWETH',
      compilerVersion: 'v0.8.16+commit.07a7930e',
      optimizationEnabled: true,
      optimizationRuns: 100,
      evmVersion: 'default',
      filePath: 'contracts/tokenbridge/libraries/aeWETH.sol',
      blockscoutVerified: true,
      sourceLength: 2_116,
      sourceSha256: '0xb26087e549d2020917195e46ed1ec4e879905bb9b4eab0b7e64855a130e2dfce' as Hex,
    }),
    requiredAbi: Object.freeze({
      approve: 'approve(address,uint256) returns (bool)',
      allowance: 'allowance(address,address) returns (uint256)',
      approvalEvent: 'Approval(address indexed,address indexed,uint256)',
    }),
  }),
  admin: Object.freeze({
    address: getAddress('0xa3Acd31AFb851B4eB9DAD00F5204c01D924267dF'),
    byteLength: 1_681,
    bytecodeHash: '0xa4b2186ab82fa36fb4ae158582e5615ea519e757c26c13ba4a33daaaed8902a7' as Hex,
    owner: getAddress('0x2A153c6A1B66DBc930a8d7017230ab0253005C09'),
  }),
  adminOwner: Object.freeze({
    address: getAddress('0x2A153c6A1B66DBc930a8d7017230ab0253005C09'),
    byteLength: 2_202,
    bytecodeHash: '0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353' as Hex,
    controlStatus: 'proxied-owner-unresolved' as const,
  }),
  beacon: null,
  tokenMetadata: Object.freeze({ name: 'WETH', symbol: 'WETH', decimals: 18 }),
  executionEligible: false as const,
  executionBlockers: Object.freeze([
    'The ProxyAdmin owner is itself a contract with transparent-proxy runtime bytecode; its implementation and ultimate control are not yet pinned.',
    'The exact approve selector and operation-specific ABI allowlist are not yet approved in executable policy.',
    'Allowance-read provider policy, exact-call simulation, confirmation UX, and receipt reconciliation are not implemented.',
    'Any implementation, admin, owner, or bytecode drift must fail closed and restart review.',
  ]),
  references: Object.freeze([
    'https://docs.robinhood.com/chain/contracts/',
    'https://eips.ethereum.org/EIPS/eip-1967',
    'https://github.com/aliimmmss/lp-mine-skains/issues/62#issuecomment-5032715508',
    'https://github.com/aliimmmss/lp-mine-skains/issues/62#issuecomment-5032763689',
  ]),
})

export function verifyRobinhoodWethProxyEvidence(observed: WethProxyObservedState): WethProxyEvidenceVerification {
  const expected = ROBINHOOD_WETH_PROXY_EVIDENCE
  const checks: WethProxyEvidenceCheck[] = [
    equalCheck('chain-id', observed.chainId, expected.chainId, 'Chain ID'),
    codeCheck('proxy', observed.proxy, expected.proxy),
    codeCheck('implementation', observed.implementation, expected.implementation),
    codeCheck('admin', observed.admin, expected.admin),
    addressCheck('beacon', observed.beacon, expected.beacon, 'Beacon address'),
    codeCheck('admin-owner', observed.adminOwner, expected.adminOwner),
  ]
  return {
    status: checks.every((check) => check.status === 'pass') ? 'verified-read-only' : 'mismatch',
    executionEligible: false,
    checks,
  }
}

function codeCheck(
  code: string,
  observed: WethProxyCodeEvidence,
  expected: Pick<WethProxyCodeEvidence, 'address' | 'byteLength' | 'bytecodeHash'>,
): WethProxyEvidenceCheck {
  const matches =
    getAddress(observed.address) === expected.address &&
    observed.byteLength === expected.byteLength &&
    observed.bytecodeHash.toLowerCase() === expected.bytecodeHash.toLowerCase()
  return {
    code,
    status: matches ? 'pass' : 'fail',
    message: matches ? `${code} evidence matches.` : `${code} address, byte length, or bytecode hash differs.`,
  }
}

function addressCheck(
  code: string,
  observed: Address | null,
  expected: Address | null,
  name: string,
): WethProxyEvidenceCheck {
  const normalizedObserved = observed === null ? null : getAddress(observed)
  const matches = normalizedObserved === expected
  return {
    code,
    status: matches ? 'pass' : 'fail',
    message: matches ? `${name} matches.` : `${name} differs.`,
  }
}

function equalCheck(code: string, observed: number, expected: number, name: string): WethProxyEvidenceCheck {
  const matches = observed === expected
  return {
    code,
    status: matches ? 'pass' : 'fail',
    message: matches ? `${name} matches.` : `${name} differs.`,
  }
}
