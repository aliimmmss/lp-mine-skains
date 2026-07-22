import { getAddress, keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem'
import { canonicalJson, WETH_ALLOWANCE_REVOCATION_OPERATION } from './weth-allowance-paper.js'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import {
  WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION,
  WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT,
} from './weth-allowance-simulation-ingestion.js'
import { WETH_ALLOWANCE_SIMULATION_POLICY_VERSION } from './weth-allowance-simulation-policy.js'
import {
  WETH_ALLOWANCE_SIMULATION_REVIEW_REPORT_VERSION,
  type WethAllowanceSimulationReviewEvidence,
} from './weth-allowance-simulation-review-report.js'
import { ROBINHOOD_WETH_AUTHORITY_EVIDENCE } from './weth-authority-evidence.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

export const WETH_ALLOWANCE_SIMULATION_REVIEW_LIFECYCLE_VERSION = '1.0.0' as const

const ZERO_DIGEST: Hex = `0x${'00'.repeat(32)}`

const REPORT_KEYS = [
  'reportVersion',
  'status',
  'ingestionReviewDigest',
  'policyEvidenceDigest',
  'fixtureVersion',
  'sourceFormat',
  'policyVersion',
  'checks',
  'reasons',
  'evidence',
  'reportDigest',
  'implementationAuthorized',
  'simulationAuthorized',
  'executionEligible',
  'disclaimer',
] as const

const EVIDENCE_KEYS = [
  'operation',
  'chainId',
  'owner',
  'token',
  'proxyAddress',
  'implementationAddress',
  'spender',
  'paperEvidenceDigest',
  'sharedBlock',
  'blockHash',
  'paperObservedAt',
  'providerObservedAt',
  'providerCount',
  'providerAgreement',
  'allowanceBefore',
  'allowanceAfter',
  'calls',
  'approvalEvent',
  'touchedContracts',
  'registryVerified',
  'authorityStatus',
  'authoritySourceAgreement',
  'unresolvedAuthorityBoundaryCount',
] as const

const CURRENT_STATE_KEYS = [
  'incidentDisabled',
  'operation',
  'chainId',
  'owner',
  'token',
  'proxyAddress',
  'implementationAddress',
  'spender',
  'paperEvidenceDigest',
  'sharedBlock',
  'blockHash',
  'currentAllowance',
  'registryVerified',
  'authorityStatus',
  'authoritySourceAgreement',
  'unresolvedAuthorityBoundaryCount',
  'providerAgreement',
  'freshness',
] as const

const REVIEWED_RENDERER_CHECK_CODES = new Set([
  'fixture-version',
  'source-format',
  'ingestion-review-digest',
  'policy-evidence-digest',
  'ingestion-status',
  'ingestion-authorization-disabled',
  'normalized-input-present',
  'policy-result-present',
  'policy-status',
  'policy-authorization-disabled',
  'policy-integrity',
  'evidence-complete',
])

const REVIEWED_INGESTION_CHECK_CODES = new Set([
  'fixture-object',
  'fixture-version',
  'source-format',
  'raw-material-absent',
  'fixture-schema',
  'policy-conformance',
])

const REVIEWED_POLICY_CHECK_CODES = new Set([
  'policy-version',
  'paper-operation',
  'paper-decision',
  'paper-execution-disabled',
  'paper-chain',
  'paper-owner',
  'paper-token',
  'paper-spender',
  'paper-amount',
  'paper-native-value',
  'paper-freshness',
  'provider-available',
  'provider-count',
  'provider-agreement',
  'paper-digest-reference',
  'shared-block',
  'provider-freshness-threshold',
  'provider-freshness',
  'provider-metadata-redacted',
  'registry-verified',
  'authority-verified',
  'identity-execution-disabled',
  'proxy-identity',
  'implementation-identity',
  'raw-transaction-material',
  'call-count',
  'root-call',
  'implementation-delegatecall',
  'call-depth',
  'prohibited-call-types',
  'touched-contracts',
  'approval-log',
  'allowance-state-diff',
  'token-balance-deltas',
  'native-balance-deltas',
  'other-state-changes',
])

export type WethAllowanceSimulationReviewCurrentState = Readonly<{
  incidentDisabled: boolean
  operation: string
  chainId: number
  owner: Address
  token: Address
  proxyAddress: Address
  implementationAddress: Address
  spender: Address
  paperEvidenceDigest: Hex
  sharedBlock: bigint
  blockHash: Hex
  currentAllowance: bigint
  registryVerified: boolean
  authorityStatus: string
  authoritySourceAgreement: boolean
  unresolvedAuthorityBoundaryCount: number
  providerAgreement: boolean
  freshness: 'fresh' | 'stale'
}>

export type WethAllowanceSimulationReviewLifecycleCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethAllowanceSimulationReviewLifecycleResult = Readonly<{
  lifecycleVersion: typeof WETH_ALLOWANCE_SIMULATION_REVIEW_LIFECYCLE_VERSION
  status: 'valid-for-human-review' | 'invalidated'
  originalReportDigest: Hex
  currentStateDigest: Hex
  checks: readonly WethAllowanceSimulationReviewLifecycleCheck[]
  reasonCodes: readonly string[]
  reasons: readonly string[]
  lifecycleDigest: Hex
  implementationAuthorized: false
  simulationAuthorized: false
  executionEligible: false
  disclaimer: string
}>

export function evaluateWethAllowanceSimulationReviewLifecycle(
  reportInput: unknown,
  currentStateInput: unknown,
): WethAllowanceSimulationReviewLifecycleResult {
  const reportRecord = isRecord(reportInput) && hasExactKeys(reportInput, REPORT_KEYS) ? reportInput : null
  const reportDigest = reportRecord !== null && isHex32(reportRecord.reportDigest) ? reportRecord.reportDigest : null
  const reportIntegrity =
    reportRecord !== null && reportDigest !== null && verifyReportDigest(reportRecord, reportDigest)
  const reportChecksValid = reportRecord !== null && validateReportChecks(reportRecord.checks)
  const reportMetadataValid =
    reportRecord !== null &&
    isHex32(reportRecord.ingestionReviewDigest) &&
    isHex32(reportRecord.policyEvidenceDigest) &&
    reportRecord.fixtureVersion === WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION &&
    reportRecord.sourceFormat === WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT &&
    reportRecord.policyVersion === WETH_ALLOWANCE_SIMULATION_POLICY_VERSION

  let evidence: WethAllowanceSimulationReviewEvidence | null = null
  try {
    evidence = reportRecord === null ? null : parseReportEvidence(reportRecord.evidence)
  } catch {
    evidence = null
  }

  let currentState: WethAllowanceSimulationReviewCurrentState | null = null
  try {
    currentState = parseCurrentState(currentStateInput)
  } catch {
    currentState = null
  }

  const checks: WethAllowanceSimulationReviewLifecycleCheck[] = [
    lifecycleCheck(
      'report-schema',
      reportRecord !== null,
      'Review report schema is valid.',
      'Review report schema is invalid.',
    ),
    lifecycleCheck(
      'report-version',
      reportRecord?.reportVersion === WETH_ALLOWANCE_SIMULATION_REVIEW_REPORT_VERSION,
      'Review report version matches.',
      'Review report version differs or is missing.',
    ),
    lifecycleCheck(
      'report-digest',
      reportDigest !== null,
      'Review report digest is valid.',
      'Review report digest is malformed.',
    ),
    lifecycleCheck(
      'report-metadata',
      reportMetadataValid,
      'Review report metadata is pinned and complete.',
      'Review report metadata is missing, malformed, or unpinned.',
    ),
    lifecycleCheck(
      'report-integrity',
      reportIntegrity,
      'Review report digest matches its contents.',
      'Review report digest does not match its contents.',
    ),
    lifecycleCheck(
      'report-checks',
      reportChecksValid,
      'Review report contains only reviewed passing checks.',
      'Review report checks are missing, failing, or unrecognized.',
    ),
    lifecycleCheck(
      'report-status',
      reportRecord?.status === 'ready-for-human-review',
      'Review report is ready for human review.',
      'Review report is not ready for human review.',
    ),
    lifecycleCheck(
      'report-authorization-disabled',
      reportRecord !== null &&
        reportRecord.implementationAuthorized === false &&
        reportRecord.simulationAuthorized === false &&
        reportRecord.executionEligible === false,
      'Review report authorization remains disabled.',
      'Review report authorization flags are absent or not all disabled.',
    ),
    lifecycleCheck(
      'report-evidence',
      evidence !== null && validateReportEvidence(evidence),
      'Review report evidence is complete and reviewed.',
      'Review report evidence is missing, malformed, or outside the reviewed boundary.',
    ),
    lifecycleCheck(
      'current-state-schema',
      currentState !== null,
      'Current-state reference schema is valid.',
      'Current-state reference schema is invalid.',
    ),
  ]

  checks.push(
    lifecycleCheck(
      'incident-disabled',
      currentState?.incidentDisabled === false,
      'Incident-disable state is inactive.',
      'Incident-disable state is active or missing.',
    ),
    lifecycleCheck(
      'operation-match',
      evidence !== null && currentState !== null && currentState.operation === evidence.operation,
      'Operation identity matches.',
      'Operation identity drifted or is missing.',
    ),
    lifecycleCheck(
      'chain-match',
      evidence !== null && currentState !== null && currentState.chainId === evidence.chainId,
      'Chain identity matches.',
      'Chain identity drifted or is missing.',
    ),
    lifecycleCheck(
      'owner-match',
      evidence !== null && currentState !== null && currentState.owner === evidence.owner,
      'Owner identity matches.',
      'Owner identity drifted or is missing.',
    ),
    lifecycleCheck(
      'token-match',
      evidence !== null && currentState !== null && currentState.token === evidence.token,
      'Token identity matches.',
      'Token identity drifted or is missing.',
    ),
    lifecycleCheck(
      'proxy-match',
      evidence !== null && currentState !== null && currentState.proxyAddress === evidence.proxyAddress,
      'Proxy identity matches.',
      'Proxy identity drifted or is missing.',
    ),
    lifecycleCheck(
      'implementation-match',
      evidence !== null &&
        currentState !== null &&
        currentState.implementationAddress === evidence.implementationAddress,
      'Implementation identity matches.',
      'Implementation identity drifted or is missing.',
    ),
    lifecycleCheck(
      'spender-match',
      evidence !== null && currentState !== null && currentState.spender === evidence.spender,
      'Spender identity matches.',
      'Spender identity drifted or is missing.',
    ),
    lifecycleCheck(
      'paper-digest-match',
      evidence !== null && currentState !== null && currentState.paperEvidenceDigest === evidence.paperEvidenceDigest,
      'Paper evidence digest matches.',
      'Paper evidence digest drifted or is missing.',
    ),
    lifecycleCheck(
      'shared-block-match',
      evidence !== null && currentState !== null && currentState.sharedBlock.toString() === evidence.sharedBlock,
      'Shared block matches.',
      'Shared block drifted or is missing.',
    ),
    lifecycleCheck(
      'block-hash-match',
      evidence !== null && currentState !== null && currentState.blockHash === evidence.blockHash,
      'Block hash matches.',
      'Block hash drifted or is missing.',
    ),
    lifecycleCheck(
      'allowance-match',
      evidence !== null &&
        currentState !== null &&
        currentState.currentAllowance > 0n &&
        currentState.currentAllowance.toString() === evidence.allowanceBefore,
      'Current allowance matches the exact reviewed nonzero allowance.',
      'Current allowance drifted, is zero, or is missing.',
    ),
    lifecycleCheck(
      'registry-verified',
      evidence !== null && currentState !== null && evidence.registryVerified && currentState.registryVerified,
      'Registry remains verified.',
      'Registry verification is absent or failed.',
    ),
    lifecycleCheck(
      'authority-verified',
      evidence !== null &&
        currentState !== null &&
        evidence.authoritySourceAgreement &&
        evidence.unresolvedAuthorityBoundaryCount === 0 &&
        currentState.authorityStatus === evidence.authorityStatus &&
        currentState.authoritySourceAgreement &&
        currentState.unresolvedAuthorityBoundaryCount === 0,
      'Authority evidence remains verified with no unresolved boundaries.',
      'Authority evidence drifted, disagrees, or has unresolved boundaries.',
    ),
    lifecycleCheck(
      'provider-agreement',
      evidence !== null && currentState !== null && evidence.providerAgreement && currentState.providerAgreement,
      'Provider agreement remains true.',
      'Provider agreement is false or missing.',
    ),
    lifecycleCheck(
      'current-evidence-freshness',
      currentState?.freshness === 'fresh',
      'Current evidence is fresh.',
      'Current evidence is stale or missing.',
    ),
  )

  const failedChecks = checks.filter((check) => check.status === 'fail')
  const status = failedChecks.length === 0 ? ('valid-for-human-review' as const) : ('invalidated' as const)
  const reasonCodes = failedChecks.map((check) => check.code)
  const reasons =
    status === 'valid-for-human-review'
      ? [
          'The offline review record remains valid for human review only. This status does not authorize implementation, simulation-provider access, signing, or execution.',
        ]
      : failedChecks.map((check) => check.message)
  const currentStateDigest = currentState === null ? ZERO_DIGEST : keccak256(stringToHex(canonicalJson(currentState)))

  const resultWithoutDigest = {
    lifecycleVersion: WETH_ALLOWANCE_SIMULATION_REVIEW_LIFECYCLE_VERSION,
    status,
    originalReportDigest: reportDigest ?? ZERO_DIGEST,
    currentStateDigest,
    checks,
    reasonCodes,
    reasons,
    implementationAuthorized: false as const,
    simulationAuthorized: false as const,
    executionEligible: false as const,
    disclaimer:
      'This offline lifecycle result is not implementation, simulation, signing, execution, or capital-allocation authorization. It performs no network read, provider call, persistence write, ABI encoding, transaction construction, wallet access, signature request, submission, receipt handling, or money movement.',
  }

  return {
    ...resultWithoutDigest,
    lifecycleDigest: keccak256(stringToHex(canonicalJson(resultWithoutDigest))),
  }
}

function parseCurrentState(value: unknown): WethAllowanceSimulationReviewCurrentState {
  const record = expectRecord(value, 'currentState')
  assertExactKeys(record, CURRENT_STATE_KEYS, 'currentState')

  return {
    incidentDisabled: expectBoolean(record.incidentDisabled, 'currentState.incidentDisabled'),
    operation: expectNonEmptyString(record.operation, 'currentState.operation'),
    chainId: expectNonNegativeInteger(record.chainId, 'currentState.chainId'),
    owner: parseAddress(record.owner, 'currentState.owner'),
    token: parseAddress(record.token, 'currentState.token'),
    proxyAddress: parseAddress(record.proxyAddress, 'currentState.proxyAddress'),
    implementationAddress: parseAddress(record.implementationAddress, 'currentState.implementationAddress'),
    spender: parseAddress(record.spender, 'currentState.spender'),
    paperEvidenceDigest: parseHex32(record.paperEvidenceDigest, 'currentState.paperEvidenceDigest'),
    sharedBlock: expectNonNegativeBigint(record.sharedBlock, 'currentState.sharedBlock'),
    blockHash: parseHex32(record.blockHash, 'currentState.blockHash'),
    currentAllowance: expectNonNegativeBigint(record.currentAllowance, 'currentState.currentAllowance'),
    registryVerified: expectBoolean(record.registryVerified, 'currentState.registryVerified'),
    authorityStatus: expectNonEmptyString(record.authorityStatus, 'currentState.authorityStatus'),
    authoritySourceAgreement: expectBoolean(record.authoritySourceAgreement, 'currentState.authoritySourceAgreement'),
    unresolvedAuthorityBoundaryCount: expectNonNegativeInteger(
      record.unresolvedAuthorityBoundaryCount,
      'currentState.unresolvedAuthorityBoundaryCount',
    ),
    providerAgreement: expectBoolean(record.providerAgreement, 'currentState.providerAgreement'),
    freshness: parseFreshness(record.freshness, 'currentState.freshness'),
  }
}

function parseReportEvidence(value: unknown): WethAllowanceSimulationReviewEvidence | null {
  if (value === null) return null
  const record = expectRecord(value, 'report.evidence')
  assertExactKeys(record, EVIDENCE_KEYS, 'report.evidence')

  const calls = expectArray(record.calls, 'report.evidence.calls').map((call, index) =>
    parseReportCall(call, `report.evidence.calls[${index}]`),
  )
  const approvalEvent = parseApprovalEvent(record.approvalEvent)
  const touchedContracts = expectArray(record.touchedContracts, 'report.evidence.touchedContracts').map(
    (address, index) => parseAddress(address, `report.evidence.touchedContracts[${index}]`),
  )

  return {
    operation: expectNonEmptyString(record.operation, 'report.evidence.operation'),
    chainId: expectNonNegativeInteger(record.chainId, 'report.evidence.chainId'),
    owner: parseAddress(record.owner, 'report.evidence.owner'),
    token: parseAddress(record.token, 'report.evidence.token'),
    proxyAddress: parseAddress(record.proxyAddress, 'report.evidence.proxyAddress'),
    implementationAddress: parseAddress(record.implementationAddress, 'report.evidence.implementationAddress'),
    spender: parseAddress(record.spender, 'report.evidence.spender'),
    paperEvidenceDigest: parseHex32(record.paperEvidenceDigest, 'report.evidence.paperEvidenceDigest'),
    sharedBlock: parseUnsignedDecimal(record.sharedBlock, 'report.evidence.sharedBlock'),
    blockHash: parseHex32(record.blockHash, 'report.evidence.blockHash'),
    paperObservedAt: parseIsoDate(record.paperObservedAt, 'report.evidence.paperObservedAt'),
    providerObservedAt: parseIsoDate(record.providerObservedAt, 'report.evidence.providerObservedAt'),
    providerCount: expectNonNegativeInteger(record.providerCount, 'report.evidence.providerCount'),
    providerAgreement: expectBoolean(record.providerAgreement, 'report.evidence.providerAgreement'),
    allowanceBefore: parseUnsignedDecimal(record.allowanceBefore, 'report.evidence.allowanceBefore'),
    allowanceAfter: parseUnsignedDecimal(record.allowanceAfter, 'report.evidence.allowanceAfter'),
    calls,
    approvalEvent,
    touchedContracts,
    registryVerified: expectBoolean(record.registryVerified, 'report.evidence.registryVerified'),
    authorityStatus: expectNonEmptyString(record.authorityStatus, 'report.evidence.authorityStatus'),
    authoritySourceAgreement: expectBoolean(
      record.authoritySourceAgreement,
      'report.evidence.authoritySourceAgreement',
    ),
    unresolvedAuthorityBoundaryCount: expectNonNegativeInteger(
      record.unresolvedAuthorityBoundaryCount,
      'report.evidence.unresolvedAuthorityBoundaryCount',
    ),
  }
}

function validateReportEvidence(evidence: WethAllowanceSimulationReviewEvidence): boolean {
  const expectedProxy = ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address
  const expectedImplementation = ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address
  const root = evidence.calls.find((call) => call.id === 'root')
  const implementation = evidence.calls.find((call) => call.id === 'implementation')

  return (
    evidence.operation === WETH_ALLOWANCE_REVOCATION_OPERATION &&
    evidence.chainId === ROBINHOOD_CHAIN_ID &&
    evidence.owner !== zeroAddress &&
    evidence.token === ROBINHOOD_UNISWAP_V3.wrappedNative &&
    evidence.proxyAddress === expectedProxy &&
    evidence.implementationAddress === expectedImplementation &&
    evidence.spender === ROBINHOOD_UNISWAP_V3.positionManager &&
    BigInt(evidence.sharedBlock) >= 0n &&
    evidence.providerCount >= 2 &&
    evidence.providerAgreement &&
    BigInt(evidence.allowanceBefore) > 0n &&
    evidence.allowanceAfter === '0' &&
    evidence.calls.length === 2 &&
    root !== undefined &&
    root.parentId === null &&
    root.depth === 0 &&
    root.type === 'call' &&
    root.from === evidence.owner &&
    root.to === evidence.token &&
    root.nativeValue === '0' &&
    root.functionName === 'approve' &&
    root.spender === evidence.spender &&
    root.amount === '0' &&
    implementation !== undefined &&
    implementation.parentId === 'root' &&
    implementation.depth === 1 &&
    implementation.type === 'delegatecall' &&
    implementation.from === evidence.proxyAddress &&
    implementation.to === evidence.implementationAddress &&
    implementation.nativeValue === '0' &&
    implementation.functionName === 'approve' &&
    implementation.spender === evidence.spender &&
    implementation.amount === '0' &&
    evidence.approvalEvent.address === evidence.token &&
    evidence.approvalEvent.eventName === 'Approval' &&
    evidence.approvalEvent.owner === evidence.owner &&
    evidence.approvalEvent.spender === evidence.spender &&
    evidence.approvalEvent.value === '0' &&
    evidence.touchedContracts.length === 2 &&
    evidence.touchedContracts[0] === evidence.proxyAddress &&
    evidence.touchedContracts[1] === evidence.implementationAddress &&
    evidence.registryVerified &&
    evidence.authorityStatus === ROBINHOOD_WETH_AUTHORITY_EVIDENCE.status &&
    evidence.authoritySourceAgreement &&
    evidence.unresolvedAuthorityBoundaryCount === 0
  )
}

function parseReportCall(value: unknown, path: string): WethAllowanceSimulationReviewEvidence['calls'][number] {
  const record = expectRecord(value, path)
  assertExactKeys(
    record,
    ['id', 'parentId', 'depth', 'type', 'from', 'to', 'nativeValue', 'functionName', 'spender', 'amount'],
    path,
  )

  return {
    id: expectNonEmptyString(record.id, `${path}.id`),
    parentId: record.parentId === null ? null : expectNonEmptyString(record.parentId, `${path}.parentId`),
    depth: expectNonNegativeInteger(record.depth, `${path}.depth`),
    type: expectNonEmptyString(record.type, `${path}.type`),
    from: parseAddress(record.from, `${path}.from`),
    to: parseAddress(record.to, `${path}.to`),
    nativeValue: parseUnsignedDecimal(record.nativeValue, `${path}.nativeValue`),
    functionName: expectNonEmptyString(record.functionName, `${path}.functionName`),
    spender: parseAddress(record.spender, `${path}.spender`),
    amount: parseUnsignedDecimal(record.amount, `${path}.amount`),
  }
}

function parseApprovalEvent(value: unknown): WethAllowanceSimulationReviewEvidence['approvalEvent'] {
  const record = expectRecord(value, 'report.evidence.approvalEvent')
  assertExactKeys(record, ['address', 'eventName', 'owner', 'spender', 'value'], 'report.evidence.approvalEvent')

  return {
    address: parseAddress(record.address, 'report.evidence.approvalEvent.address'),
    eventName: expectNonEmptyString(record.eventName, 'report.evidence.approvalEvent.eventName'),
    owner: parseAddress(record.owner, 'report.evidence.approvalEvent.owner'),
    spender: parseAddress(record.spender, 'report.evidence.approvalEvent.spender'),
    value: parseUnsignedDecimal(record.value, 'report.evidence.approvalEvent.value'),
  }
}

function validateReportChecks(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false

  const observed = {
    renderer: new Set<string>(),
    ingestion: new Set<string>(),
    policy: new Set<string>(),
  }

  for (const item of value) {
    if (!isRecord(item) || !hasExactKeys(item, ['source', 'code', 'status', 'message'])) return false
    if (item.status !== 'pass' || typeof item.message !== 'string' || typeof item.code !== 'string') return false

    if (item.source === 'renderer') {
      if (!REVIEWED_RENDERER_CHECK_CODES.has(item.code) || observed.renderer.has(item.code)) return false
      observed.renderer.add(item.code)
      continue
    }
    if (item.source === 'ingestion') {
      if (!REVIEWED_INGESTION_CHECK_CODES.has(item.code) || observed.ingestion.has(item.code)) return false
      observed.ingestion.add(item.code)
      continue
    }
    if (item.source === 'policy') {
      if (!REVIEWED_POLICY_CHECK_CODES.has(item.code) || observed.policy.has(item.code)) return false
      observed.policy.add(item.code)
      continue
    }
    return false
  }

  return (
    setsEqual(observed.renderer, REVIEWED_RENDERER_CHECK_CODES) &&
    setsEqual(observed.ingestion, REVIEWED_INGESTION_CHECK_CODES) &&
    setsEqual(observed.policy, REVIEWED_POLICY_CHECK_CODES)
  )
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value))
}
function verifyReportDigest(record: Record<string, unknown>, digest: Hex): boolean {
  try {
    const reportWithoutDigest = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'reportDigest'))
    return keccak256(stringToHex(canonicalJson(reportWithoutDigest))) === digest
  } catch {
    return false
  }
}

function parseAddress(value: unknown, path: string): Address {
  if (typeof value !== 'string') throw new TypeError(`${path} must be a string address`)
  try {
    return getAddress(value)
  } catch {
    throw new TypeError(`${path} must be a valid EVM address`)
  }
}

function parseHex32(value: unknown, path: string): Hex {
  if (!isHex32(value)) throw new TypeError(`${path} must be a 32-byte hex value`)
  return value
}

function isHex32(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)
}

function parseUnsignedDecimal(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`${path} must be an unsigned decimal string`)
  }
  return value
}

function parseIsoDate(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new TypeError(`${path} must be an ISO-8601 timestamp`)
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new TypeError(`${path} must be a canonical ISO-8601 timestamp`)
  }
  return value
}

function parseFreshness(value: unknown, path: string): 'fresh' | 'stale' {
  if (value === 'fresh' || value === 'stale') return value
  throw new TypeError(`${path} must be fresh or stale`)
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${path} must be an object`)
  return value
}

function expectArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`)
  return value
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${path} must be a boolean`)
  return value
}

function expectNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${path} must be a non-empty string`)
  return value
}

function expectNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${path} must be a non-negative safe integer`)
  }
  return value
}

function expectNonNegativeBigint(value: unknown, path: string): bigint {
  if (typeof value !== 'bigint' || value < 0n) throw new TypeError(`${path} must be a non-negative bigint`)
  return value
}

function assertExactKeys(record: Record<string, unknown>, keys: readonly string[], path: string): void {
  if (!hasExactKeys(record, keys)) throw new TypeError(`${path} has missing or unsupported fields`)
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(record)
  return actualKeys.length === keys.length && keys.every((key) => key in record)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function lifecycleCheck(
  code: string,
  passes: boolean,
  passMessage: string,
  failMessage: string,
): WethAllowanceSimulationReviewLifecycleCheck {
  return {
    code,
    status: passes ? 'pass' : 'fail',
    message: passes ? passMessage : failMessage,
  }
}
