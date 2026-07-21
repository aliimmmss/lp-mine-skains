import { getAddress, type Address, type Hex } from 'viem'
import { ROBINHOOD_CHAIN_ID } from './registry.js'

export type WethControlCodeEvidence = Readonly<{
  address: Address
  byteLength: number
  bytecodeHash: Hex
}>

export type WethControlObservedState = Readonly<{
  chainId: number
  controllerProxy: WethControlCodeEvidence
  controllerImplementation: WethControlCodeEvidence
  controllerAdmin: WethControlCodeEvidence
  controllerBeacon: Address | null
  proxyAdminOwner: Address
}>

export type WethControlCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethControlVerification = Readonly<{
  status: 'verified-read-only' | 'mismatch'
  executionEligible: false
  checks: readonly WethControlCheck[]
}>

export const ROBINHOOD_WETH_CONTROL_EVIDENCE = Object.freeze({
  status: 'read-only-verified-role-membership-unresolved' as const,
  chainId: ROBINHOOD_CHAIN_ID,
  sharedBlock: 15_493_693n,
  reviewedAt: '2026-07-21T10:32:42.059Z',
  auditRunId: '29822600084',
  sourceAgreement: true,
  controllerProxy: Object.freeze({
    address: getAddress('0x2A153c6A1B66DBc930a8d7017230ab0253005C09'),
    byteLength: 2_202,
    bytecodeHash: '0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353' as Hex,
    proxyType: 'transparent-eip1967' as const,
    source: Object.freeze({
      name: 'TransparentUpgradeableProxy',
      compilerVersion: 'v0.8.16+commit.07a7930e',
      filePath: '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
      blockscoutVerified: true,
      sourceLength: 8_279,
      sourceSha256: '0xbe83b87e6f2dbc5d0dea923bb45092689382f1580893dfda28438452ffa10e88' as Hex,
    }),
  }),
  controllerImplementation: Object.freeze({
    address: getAddress('0x3c3E52bC8C181D06A76e2518bBc655C5BB3Ce7Cd'),
    byteLength: 6_204,
    bytecodeHash: '0x0d88feac198ef1b50b99fddf06aa9f6b1050bfe7211d6f04173de9b6d8953bcb' as Hex,
    source: Object.freeze({
      explorerName: 'UpgradeExtractor',
      filePath: 'src/UpgradeExecutor.sol',
      compilerVersion: 'v0.8.16+commit.07a7930e',
      blockscoutVerified: true,
      blockscoutPartiallyVerified: true,
      sourceLength: 3_558,
      sourceSha256: '0x202d0719dbd3588e63a8c3675a63383d739f3438e393740ca61ca768e6abe30c' as Hex,
    }),
    accessControl: Object.freeze({
      enumerable: false,
      roleIdentifiers: Object.freeze(['DEFAULT_ADMIN_ROLE', 'ADMIN_ROLE', 'EXECUTOR_ROLE']),
      readFunctions: Object.freeze(['hasRole', 'getRoleAdmin', 'supportsInterface']),
      mutationFunctions: Object.freeze([
        'grantRole',
        'revokeRole',
        'renounceRole',
        'execute',
        'executeCall',
        'initialize',
      ]),
      authorityStatus: 'role-membership-unresolved' as const,
    }),
  }),
  controllerAdmin: Object.freeze({
    address: getAddress('0xa3Acd31AFb851B4eB9DAD00F5204c01D924267dF'),
    byteLength: 1_681,
    bytecodeHash: '0xa4b2186ab82fa36fb4ae158582e5615ea519e757c26c13ba4a33daaaed8902a7' as Hex,
    owner: getAddress('0x2A153c6A1B66DBc930a8d7017230ab0253005C09'),
    source: Object.freeze({
      name: 'ProxyAdmin',
      compilerVersion: 'v0.8.16+commit.07a7930e',
      filePath: '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol',
      blockscoutVerified: true,
      sourceLength: 2_860,
      sourceSha256: '0xe1f18ca464715b24fa20b49ca2b75aff9084a96bd7e726ace63097270719433b' as Hex,
    }),
  }),
  controllerBeacon: null,
  controlStatus: 'access-control-role-membership-unresolved' as const,
  executionEligible: false as const,
  executionBlockers: Object.freeze([
    'The controller implementation uses non-enumerable AccessControl roles, so current role holders are not proven by direct enumeration.',
    'ADMIN_ROLE, EXECUTOR_ROLE, and DEFAULT_ADMIN_ROLE grants and revocations must be reconstructed from independently verified evidence.',
    'Any controller proxy, implementation, admin, role, or bytecode drift must restart review.',
    'No simulation, wallet, signature, submission, or receipt-reconciliation gate is approved.',
  ]),
  references: Object.freeze([
    'https://github.com/aliimmmss/lp-mine-skains/issues/68#issuecomment-5032901765',
    'https://github.com/aliimmmss/lp-mine-skains/issues/62',
  ]),
})

export function verifyRobinhoodWethControlEvidence(observed: WethControlObservedState): WethControlVerification {
  const expected = ROBINHOOD_WETH_CONTROL_EVIDENCE
  const checks: WethControlCheck[] = [
    scalarCheck('chain-id', observed.chainId, expected.chainId, 'Chain ID'),
    codeCheck('controller-proxy', observed.controllerProxy, expected.controllerProxy),
    codeCheck('controller-implementation', observed.controllerImplementation, expected.controllerImplementation),
    codeCheck('controller-admin', observed.controllerAdmin, expected.controllerAdmin),
    addressCheck('controller-beacon', observed.controllerBeacon, expected.controllerBeacon, 'Controller beacon'),
    addressCheck('proxy-admin-owner', observed.proxyAdminOwner, expected.controllerAdmin.owner, 'ProxyAdmin owner'),
  ]
  return {
    status: checks.every((item) => item.status === 'pass') ? 'verified-read-only' : 'mismatch',
    executionEligible: false,
    checks,
  }
}

function codeCheck(
  code: string,
  observed: WethControlCodeEvidence,
  expected: Pick<WethControlCodeEvidence, 'address' | 'byteLength' | 'bytecodeHash'>,
): WethControlCheck {
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
): WethControlCheck {
  const normalizedObserved = observed === null ? null : getAddress(observed)
  const matches = normalizedObserved === expected
  return {
    code,
    status: matches ? 'pass' : 'fail',
    message: matches ? `${name} matches.` : `${name} differs.`,
  }
}

function scalarCheck(code: string, observed: number, expected: number, name: string): WethControlCheck {
  const matches = observed === expected
  return {
    code,
    status: matches ? 'pass' : 'fail',
    message: matches ? `${name} matches.` : `${name} differs.`,
  }
}
