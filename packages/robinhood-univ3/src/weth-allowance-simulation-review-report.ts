import { keccak256, stringToHex, type Address, type Hex } from 'viem'
import { canonicalJson } from './weth-allowance-paper.js'
import {
  WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION,
  WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT,
  type WethAllowanceSimulationIngestionResult,
} from './weth-allowance-simulation-ingestion.js'
import {
  WETH_ALLOWANCE_SIMULATION_POLICY_VERSION,
  validateWethAllowanceSimulationEvidencePolicy,
  type WethAllowanceSimulationCall,
  type WethAllowanceSimulationLog,
  type WethAllowanceSimulationPolicyInput,
} from './weth-allowance-simulation-policy.js'

export const WETH_ALLOWANCE_SIMULATION_REVIEW_REPORT_VERSION = '1.0.0' as const

const ZERO_DIGEST = `0x${'00'.repeat(32)}` as Hex

export type WethAllowanceSimulationReviewReportCheck = Readonly<{
  source: 'renderer' | 'ingestion' | 'policy'
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethAllowanceSimulationReviewCall = Readonly<{
  id: string
  parentId: string | null
  depth: number
  type: string
  from: Address
  to: Address
  nativeValue: string
  functionName: string
  spender: Address
  amount: string
}>

export type WethAllowanceSimulationReviewEvent = Readonly<{
  address: Address
  eventName: string
  owner: Address
  spender: Address
  value: string
}>

export type WethAllowanceSimulationReviewEvidence = Readonly<{
  operation: string
  chainId: number
  owner: Address
  token: Address
  proxyAddress: Address
  implementationAddress: Address
  spender: Address
  paperEvidenceDigest: Hex
  sharedBlock: string
  blockHash: Hex
  paperObservedAt: string
  providerObservedAt: string
  providerCount: number
  providerAgreement: boolean
  allowanceBefore: string
  allowanceAfter: string
  calls: readonly WethAllowanceSimulationReviewCall[]
  approvalEvent: WethAllowanceSimulationReviewEvent
  touchedContracts: readonly Address[]
  registryVerified: boolean
  authorityStatus: string
  authoritySourceAgreement: boolean
  unresolvedAuthorityBoundaryCount: number
}>

export type WethAllowanceSimulationReviewReport = Readonly<{
  reportVersion: typeof WETH_ALLOWANCE_SIMULATION_REVIEW_REPORT_VERSION
  status: 'blocked' | 'ready-for-human-review'
  ingestionReviewDigest: Hex
  policyEvidenceDigest: Hex | null
  fixtureVersion: string
  sourceFormat: string | null
  policyVersion: string | null
  checks: readonly WethAllowanceSimulationReviewReportCheck[]
  reasons: readonly string[]
  evidence: WethAllowanceSimulationReviewEvidence | null
  reportDigest: Hex
  implementationAuthorized: false
  simulationAuthorized: false
  executionEligible: false
  disclaimer: string
}>

export function createWethAllowanceSimulationReviewReport(
  ingestion: WethAllowanceSimulationIngestionResult,
): WethAllowanceSimulationReviewReport {
  const ingestionDigestValid = isHex32(ingestion.reviewDigest)
  const policyDigestValid = ingestion.policyResult === null || isHex32(ingestion.policyResult.evidenceDigest)
  const policyIntegrityValid = verifyPolicyIntegrity(ingestion)

  const checks: WethAllowanceSimulationReviewReportCheck[] = [
    rendererCheck(
      'fixture-version',
      ingestion.fixtureVersion === WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION,
      'Fixture version matches the reviewed ingestion format.',
      'Fixture version is not the reviewed ingestion format.',
    ),
    rendererCheck(
      'source-format',
      ingestion.sourceFormat === WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT,
      'Source format matches the reviewed sanitized format.',
      'Source format is absent or unsupported.',
    ),
    rendererCheck(
      'ingestion-review-digest',
      ingestionDigestValid,
      'Ingestion review digest is valid.',
      'Ingestion review digest is malformed.',
    ),
    rendererCheck(
      'policy-evidence-digest',
      policyDigestValid,
      'Policy evidence digest is valid or absent.',
      'Policy evidence digest is malformed.',
    ),
    rendererCheck(
      'ingestion-status',
      ingestion.status === 'normalized',
      'Ingestion status is normalized.',
      'Ingestion status is blocked.',
    ),
    rendererCheck(
      'ingestion-authorization-disabled',
      ingestion.implementationAuthorized === false &&
        ingestion.simulationAuthorized === false &&
        ingestion.executionEligible === false,
      'Ingestion authorization remains disabled.',
      'Ingestion authorization flags are not all disabled.',
    ),
    rendererCheck(
      'normalized-input-present',
      ingestion.normalizedInput !== null,
      'Normalized policy input is present.',
      'Normalized policy input is missing.',
    ),
    rendererCheck(
      'policy-result-present',
      ingestion.policyResult !== null,
      'Policy result is present.',
      'Policy result is missing.',
    ),
    rendererCheck(
      'policy-status',
      ingestion.policyResult?.status === 'policy-conformant',
      'Policy status is conformant.',
      'Policy status is absent or blocked.',
    ),
    rendererCheck(
      'policy-authorization-disabled',
      ingestion.policyResult !== null &&
        ingestion.policyResult.implementationAuthorized === false &&
        ingestion.policyResult.simulationAuthorized === false &&
        ingestion.policyResult.executionEligible === false,
      'Policy authorization remains disabled.',
      'Policy authorization flags are absent or not all disabled.',
    ),
    rendererCheck(
      'policy-integrity',
      policyIntegrityValid,
      'Normalized input reproduces the reviewed conformant policy digest.',
      'Normalized input does not reproduce the reviewed conformant policy digest.',
    ),
  ]

  checks.push(...safeUpstreamChecks('ingestion', ingestion.checks))
  if (ingestion.policyResult !== null) {
    checks.push(...safeUpstreamChecks('policy', ingestion.policyResult.checks))
  }

  let evidence: WethAllowanceSimulationReviewEvidence | null = null
  if (checks.every((check) => check.status === 'pass')) {
    try {
      evidence = buildReviewEvidence(ingestion.normalizedInput as WethAllowanceSimulationPolicyInput)
      checks.push(
        rendererCheck(
          'evidence-complete',
          true,
          'Required normalized evidence is complete.',
          'Required normalized evidence is incomplete.',
        ),
      )
    } catch (error) {
      checks.push(
        rendererCheck(
          'evidence-complete',
          false,
          'Required normalized evidence is complete.',
          error instanceof Error ? error.message : 'Required normalized evidence is incomplete.',
        ),
      )
    }
  }

  const failedChecks = checks.filter((check) => check.status === 'fail')
  const status =
    failedChecks.length === 0 && evidence !== null ? ('ready-for-human-review' as const) : ('blocked' as const)
  const reasons =
    status === 'ready-for-human-review'
      ? [
          'The normalized offline evidence is ready for human review only. This status does not authorize implementation, simulation-provider access, signing, or execution.',
        ]
      : failedChecks.map((check) => check.message)

  const reportWithoutDigest = {
    reportVersion: WETH_ALLOWANCE_SIMULATION_REVIEW_REPORT_VERSION,
    status,
    ingestionReviewDigest: ingestionDigestValid ? ingestion.reviewDigest : ZERO_DIGEST,
    policyEvidenceDigest:
      ingestion.policyResult !== null && isHex32(ingestion.policyResult.evidenceDigest)
        ? ingestion.policyResult.evidenceDigest
        : null,
    fixtureVersion:
      ingestion.fixtureVersion === WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION
        ? WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION
        : 'invalid',
    sourceFormat:
      ingestion.sourceFormat === WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT
        ? WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT
        : null,
    policyVersion:
      ingestion.policyResult?.policyVersion === WETH_ALLOWANCE_SIMULATION_POLICY_VERSION
        ? WETH_ALLOWANCE_SIMULATION_POLICY_VERSION
        : null,
    checks,
    reasons,
    evidence,
    implementationAuthorized: false as const,
    simulationAuthorized: false as const,
    executionEligible: false as const,
    disclaimer:
      'This offline review report is not implementation, simulation, signing, execution, or capital-allocation authorization. It contains no provider endpoint, credential, raw payload, selector, calldata, transaction request, wallet state, signature, nonce, gas price, submission field, or receipt.',
  }

  return {
    ...reportWithoutDigest,
    reportDigest: keccak256(stringToHex(canonicalJson(reportWithoutDigest))),
  }
}

export function renderWethAllowanceSimulationReviewText(report: WethAllowanceSimulationReviewReport): string {
  const lines = [
    'WETH allowance-revocation offline review report',
    `Report version: ${report.reportVersion}`,
    `Status: ${report.status}`,
    `Report digest: ${report.reportDigest}`,
    `Ingestion review digest: ${report.ingestionReviewDigest}`,
    `Policy evidence digest: ${report.policyEvidenceDigest ?? 'unavailable'}`,
    `Fixture version: ${report.fixtureVersion}`,
    `Source format: ${report.sourceFormat ?? 'unavailable'}`,
    `Policy version: ${report.policyVersion ?? 'unavailable'}`,
    'Implementation authorized: false',
    'Simulation authorized: false',
    'Execution eligible: false',
    '',
    'Reasons:',
    ...report.reasons.map((reason) => `- ${reason}`),
  ]

  if (report.evidence !== null) {
    const evidence = report.evidence
    lines.push(
      '',
      'Normalized evidence:',
      `Operation: ${evidence.operation}`,
      `Chain ID: ${evidence.chainId}`,
      `Owner: ${evidence.owner}`,
      `Token: ${evidence.token}`,
      `WETH proxy: ${evidence.proxyAddress}`,
      `Reviewed implementation: ${evidence.implementationAddress}`,
      `Spender: ${evidence.spender}`,
      `Paper evidence digest: ${evidence.paperEvidenceDigest}`,
      `Shared block: ${evidence.sharedBlock}`,
      `Block hash: ${evidence.blockHash}`,
      `Paper observed at: ${evidence.paperObservedAt}`,
      `Provider observed at: ${evidence.providerObservedAt}`,
      `Provider count: ${evidence.providerCount}`,
      `Provider agreement: ${evidence.providerAgreement}`,
      `Allowance before: ${evidence.allowanceBefore}`,
      `Allowance after: ${evidence.allowanceAfter}`,
      `Registry verified: ${evidence.registryVerified}`,
      `Authority status: ${evidence.authorityStatus}`,
      `Authority source agreement: ${evidence.authoritySourceAgreement}`,
      `Unresolved authority boundaries: ${evidence.unresolvedAuthorityBoundaryCount}`,
      '',
      'Call tree:',
      ...evidence.calls.map(
        (call) =>
          `- ${call.id}: depth=${call.depth} type=${call.type} from=${call.from} to=${call.to} function=${call.functionName} spender=${call.spender} amount=${call.amount} nativeValue=${call.nativeValue}`,
      ),
      '',
      'Approval event:',
      `- address=${evidence.approvalEvent.address} owner=${evidence.approvalEvent.owner} spender=${evidence.approvalEvent.spender} value=${evidence.approvalEvent.value}`,
      '',
      'Touched contracts:',
      ...evidence.touchedContracts.map((address) => `- ${address}`),
    )
  }

  lines.push(
    '',
    'Checks:',
    ...report.checks.map((check) => `- ${check.source}:${check.code}=${check.status}`),
    '',
    report.disclaimer,
  )
  return lines.join('\n')
}

function verifyPolicyIntegrity(ingestion: WethAllowanceSimulationIngestionResult): boolean {
  if (ingestion.normalizedInput === null || ingestion.policyResult === null) return false
  const observedAt = ingestion.normalizedInput.providers.observedAt
  if (!(observedAt instanceof Date) || Number.isNaN(observedAt.getTime())) return false

  try {
    const replay = validateWethAllowanceSimulationEvidencePolicy(ingestion.normalizedInput, observedAt)
    return replay.status === 'policy-conformant' && replay.evidenceDigest === ingestion.policyResult.evidenceDigest
  } catch {
    return false
  }
}

function buildReviewEvidence(input: WethAllowanceSimulationPolicyInput): WethAllowanceSimulationReviewEvidence {
  if (input.policyVersion !== WETH_ALLOWANCE_SIMULATION_POLICY_VERSION) {
    throw new TypeError('Normalized policy version differs from the reviewed version.')
  }
  if (input.containsRawTransactionMaterial) {
    throw new TypeError('Normalized evidence indicates raw transaction material.')
  }
  if (
    input.providers.sharedBlock === null ||
    input.providers.blockHash === null ||
    input.providers.observedAt === null
  ) {
    throw new TypeError('Provider block binding or observation timestamp is missing.')
  }
  if (input.calls.length !== 2) throw new TypeError('Normalized call tree must contain exactly two calls.')
  if (input.logs.length !== 1) throw new TypeError('Normalized evidence must contain exactly one log.')
  if (input.touchedContracts.length !== 2) {
    throw new TypeError('Normalized touched-contract set must contain exactly two addresses.')
  }
  if (input.stateDiff.allowanceBefore <= 0n || input.stateDiff.allowanceAfter !== 0n) {
    throw new TypeError('Normalized allowance transition must be nonzero to zero.')
  }
  if (
    input.stateDiff.tokenBalanceDeltas.length !== 0 ||
    input.stateDiff.nativeBalanceDeltas.length !== 0 ||
    input.stateDiff.otherStateChanges.length !== 0
  ) {
    throw new TypeError('Normalized evidence contains an unexpected balance or state change.')
  }

  const root = requiredCall(input.calls, 'root')
  const implementation = requiredCall(input.calls, 'implementation')
  const approvalEvent = requiredApprovalEvent(input.logs)
  assertValidDate(input.paper.observedAt, 'Paper observation timestamp')
  assertValidDate(input.providers.observedAt, 'Provider observation timestamp')

  return {
    operation: nonEmpty(input.paper.operation, 'Paper operation'),
    chainId: input.paper.chainId,
    owner: input.paper.owner,
    token: input.paper.token,
    proxyAddress: input.identity.proxyAddress,
    implementationAddress: input.identity.implementationAddress,
    spender: input.paper.spender,
    paperEvidenceDigest: input.paper.evidenceDigest,
    sharedBlock: input.providers.sharedBlock.toString(),
    blockHash: input.providers.blockHash,
    paperObservedAt: input.paper.observedAt.toISOString(),
    providerObservedAt: input.providers.observedAt.toISOString(),
    providerCount: input.providers.providerCount,
    providerAgreement: input.providers.providerAgreement,
    allowanceBefore: input.stateDiff.allowanceBefore.toString(),
    allowanceAfter: input.stateDiff.allowanceAfter.toString(),
    calls: [summarizeCall(root), summarizeCall(implementation)],
    approvalEvent: summarizeEvent(approvalEvent),
    touchedContracts: [...input.touchedContracts],
    registryVerified: input.identity.registryVerified,
    authorityStatus: nonEmpty(input.identity.authorityStatus, 'Authority status'),
    authoritySourceAgreement: input.identity.authoritySourceAgreement,
    unresolvedAuthorityBoundaryCount: input.identity.unresolvedAuthorityBoundaryCount,
  }
}

function requiredCall(calls: readonly WethAllowanceSimulationCall[], id: string): WethAllowanceSimulationCall {
  const call = calls.find((candidate) => candidate.id === id)
  if (call === undefined) throw new TypeError(`Required normalized call is missing: ${id}.`)
  return call
}

function requiredApprovalEvent(logs: readonly WethAllowanceSimulationLog[]): WethAllowanceSimulationLog {
  const event = logs[0]
  if (event === undefined || event.eventName !== 'Approval') {
    throw new TypeError('Required normalized Approval event is missing.')
  }
  return event
}

function summarizeCall(call: WethAllowanceSimulationCall): WethAllowanceSimulationReviewCall {
  return {
    id: nonEmpty(call.id, 'Call ID'),
    parentId: call.parentId,
    depth: call.depth,
    type: call.type,
    from: call.from,
    to: call.to,
    nativeValue: call.nativeValue.toString(),
    functionName: nonEmpty(call.functionName, 'Call function name'),
    spender: call.spender,
    amount: call.amount.toString(),
  }
}

function summarizeEvent(event: WethAllowanceSimulationLog): WethAllowanceSimulationReviewEvent {
  return {
    address: event.address,
    eventName: event.eventName,
    owner: event.owner,
    spender: event.spender,
    value: event.value.toString(),
  }
}

function safeUpstreamChecks(
  source: 'ingestion' | 'policy',
  checks: readonly Readonly<{ code: string; status: 'pass' | 'fail' }>[],
): WethAllowanceSimulationReviewReportCheck[] {
  return checks.map((check) => {
    const code = safeCheckCode(check.code)
    return {
      source,
      code,
      status: check.status,
      message: `${source === 'ingestion' ? 'Ingestion' : 'Policy'} check ${check.status === 'pass' ? 'passed' : 'failed'}: ${code}.`,
    }
  })
}

function safeCheckCode(value: string): string {
  return /^[a-z0-9-]{1,80}$/.test(value) ? value : 'invalid-check-code'
}

function isHex32(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)
}

function rendererCheck(
  code: string,
  passes: boolean,
  passMessage: string,
  failMessage: string,
): WethAllowanceSimulationReviewReportCheck {
  return {
    source: 'renderer',
    code,
    status: passes ? 'pass' : 'fail',
    message: passes ? passMessage : failMessage,
  }
}

function assertValidDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new TypeError(`${label} is invalid.`)
}

function nonEmpty(value: string, label: string): string {
  if (value.length === 0) throw new TypeError(`${label} is empty.`)
  return value
}
