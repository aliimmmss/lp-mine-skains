import { getAddress, isAddress, keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem'
import { ROBINHOOD_REGISTRY_EVIDENCE, type RegistryBytecodeVerificationStatus } from './registry-evidence.js'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { ROBINHOOD_WETH_AUTHORITY_EVIDENCE } from './weth-authority-evidence.js'

export const WETH_ALLOWANCE_REVOCATION_OPERATION = 'revoke-weth-allowance-for-position-manager' as const

export type WethAllowancePaperDecision = 'blocked' | 'noop' | 'ready-for-separate-simulation-review'
export type WethAllowanceFreshness = 'fresh' | 'stale' | 'future' | 'unavailable'

export type WethAllowancePaperIntent = Readonly<{
  operation: string
  chainId: number
  owner: string
  token: string
  spender: string
  desiredAllowance: bigint
  nativeValue: bigint
}>

export type WethAllowanceRegistryPaperEvidence = Readonly<{
  tokenStatus: RegistryBytecodeVerificationStatus
  spenderStatus: RegistryBytecodeVerificationStatus
  tokenExecutionEligible: boolean
  spenderExecutionEligible: boolean
  allEntriesExecutionIneligible: boolean
}>

export type WethAllowanceAuthorityPaperEvidence = Readonly<{
  status: string
  sourceAgreement: boolean
  authorityBoundaryCount: number
  executionEligible: boolean
}>

export type WethAllowanceReadEvidence = Readonly<{
  status: 'available' | 'unavailable'
  sharedBlock: bigint | null
  blockHash: Hex | null
  observedAt: Date | null
  providerCount: number
  providerAgreement: boolean
  allowance: bigint | null
  maximumAgeSeconds: number
}>

export type WethAllowancePaperInput = Readonly<{
  intent: WethAllowancePaperIntent
  registry: WethAllowanceRegistryPaperEvidence
  authority: WethAllowanceAuthorityPaperEvidence
  allowance: WethAllowanceReadEvidence
}>

export type WethAllowancePaperCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type NormalizedWethAllowancePaperIntent = Readonly<{
  operation: string
  chainId: number
  owner: Address | null
  token: Address | null
  spender: Address | null
  desiredAllowance: bigint
  nativeValue: bigint
}>

export type WethAllowancePaperReport = Readonly<{
  mode: 'read-only-paper'
  generatedAt: Date
  operation: typeof WETH_ALLOWANCE_REVOCATION_OPERATION
  intent: NormalizedWethAllowancePaperIntent
  evidence: Readonly<{
    registry: WethAllowanceRegistryPaperEvidence
    authority: WethAllowanceAuthorityPaperEvidence
    allowance: WethAllowanceReadEvidence &
      Readonly<{
        freshness: WethAllowanceFreshness
        ageSeconds: number | null
      }>
  }>
  checks: readonly WethAllowancePaperCheck[]
  decision: WethAllowancePaperDecision
  reasons: readonly string[]
  evidenceDigest: Hex
  executionEligible: false
  disclaimer: string
}>

export function defaultWethAllowanceRegistryPaperEvidence(): WethAllowanceRegistryPaperEvidence {
  const token = ROBINHOOD_REGISTRY_EVIDENCE.entries.find(
    (entry) => entry.address === ROBINHOOD_UNISWAP_V3.wrappedNative,
  )
  const spender = ROBINHOOD_REGISTRY_EVIDENCE.entries.find(
    (entry) => entry.address === ROBINHOOD_UNISWAP_V3.positionManager,
  )

  return {
    tokenStatus: token === undefined ? 'unregistered' : 'verified',
    spenderStatus: spender === undefined ? 'unregistered' : 'verified',
    tokenExecutionEligible: token?.executionEligible ?? true,
    spenderExecutionEligible: spender?.executionEligible ?? true,
    allEntriesExecutionIneligible: ROBINHOOD_REGISTRY_EVIDENCE.entries.every(
      (entry) => entry.executionEligible === false,
    ),
  }
}

export function defaultWethAllowanceAuthorityPaperEvidence(): WethAllowanceAuthorityPaperEvidence {
  return {
    status: ROBINHOOD_WETH_AUTHORITY_EVIDENCE.status,
    sourceAgreement: ROBINHOOD_WETH_AUTHORITY_EVIDENCE.sourceAgreement,
    authorityBoundaryCount: ROBINHOOD_WETH_AUTHORITY_EVIDENCE.authorityBoundaries.length,
    executionEligible: ROBINHOOD_WETH_AUTHORITY_EVIDENCE.executionEligible,
  }
}

export function evaluateWethAllowanceRevocationPaperMode(
  input: WethAllowancePaperInput,
  generatedAt = new Date(),
): WethAllowancePaperReport {
  if (Number.isNaN(generatedAt.getTime())) throw new RangeError('generatedAt must be valid')

  const owner = normalizeAddress(input.intent.owner)
  const token = normalizeAddress(input.intent.token)
  const spender = normalizeAddress(input.intent.spender)
  const normalizedIntent: NormalizedWethAllowancePaperIntent = {
    operation: input.intent.operation,
    chainId: input.intent.chainId,
    owner,
    token,
    spender,
    desiredAllowance: input.intent.desiredAllowance,
    nativeValue: input.intent.nativeValue,
  }

  const freshness = allowanceFreshness(input.allowance, generatedAt)
  const ageSeconds = allowanceAgeSeconds(input.allowance, generatedAt)
  const checks: WethAllowancePaperCheck[] = [
    paperCheck(
      'operation-id',
      input.intent.operation === WETH_ALLOWANCE_REVOCATION_OPERATION,
      'Operation identifier is pinned.',
      'Operation identifier is not allowlisted.',
    ),
    paperCheck(
      'chain-id',
      input.intent.chainId === ROBINHOOD_CHAIN_ID,
      'Chain ID is pinned to Robinhood Chain.',
      'Chain ID differs from the pinned Robinhood Chain ID.',
    ),
    paperCheck(
      'owner-address',
      owner !== null && owner !== zeroAddress,
      'Owner address is valid.',
      'Owner address is invalid.',
    ),
    paperCheck(
      'token-address',
      token === ROBINHOOD_UNISWAP_V3.wrappedNative,
      'Token is the pinned WETH address.',
      'Token differs from the pinned WETH address.',
    ),
    paperCheck(
      'spender-address',
      spender === ROBINHOOD_UNISWAP_V3.positionManager,
      'Spender is the pinned position manager.',
      'Spender differs from the pinned position manager.',
    ),
    paperCheck(
      'desired-allowance',
      input.intent.desiredAllowance === 0n,
      'Desired allowance is exactly zero.',
      'Desired allowance must be exactly zero.',
    ),
    paperCheck(
      'native-value',
      input.intent.nativeValue === 0n,
      'Native value is exactly zero.',
      'Native value must be exactly zero.',
    ),
    paperCheck(
      'registry-token-bytecode',
      input.registry.tokenStatus === 'verified',
      'WETH bytecode matches the pinned registry evidence.',
      `WETH bytecode verification status is ${input.registry.tokenStatus}.`,
    ),
    paperCheck(
      'registry-spender-bytecode',
      input.registry.spenderStatus === 'verified',
      'Position-manager bytecode matches the pinned registry evidence.',
      `Position-manager bytecode verification status is ${input.registry.spenderStatus}.`,
    ),
    paperCheck(
      'registry-execution-disabled',
      input.registry.allEntriesExecutionIneligible &&
        input.registry.tokenExecutionEligible === false &&
        input.registry.spenderExecutionEligible === false,
      'Registry execution eligibility remains disabled.',
      'Registry execution eligibility is not fail-closed.',
    ),
    paperCheck(
      'authority-status',
      input.authority.status === 'read-only-authority-chain-verified',
      'WETH authority evidence is verified read-only.',
      'WETH authority evidence status is not verified.',
    ),
    paperCheck(
      'authority-source-agreement',
      input.authority.sourceAgreement,
      'WETH authority evidence sources agree.',
      'WETH authority evidence sources do not agree.',
    ),
    paperCheck(
      'authority-boundaries',
      input.authority.authorityBoundaryCount === 0,
      'No unresolved WETH authority boundaries remain.',
      'Unresolved WETH authority boundaries remain.',
    ),
    paperCheck(
      'authority-execution-disabled',
      input.authority.executionEligible === false,
      'WETH authority execution eligibility remains disabled.',
      'WETH authority evidence is not fail-closed.',
    ),
    paperCheck(
      'allowance-available',
      input.allowance.status === 'available' && input.allowance.allowance !== null,
      'Allowance evidence is available.',
      'Allowance evidence is unavailable.',
    ),
    paperCheck(
      'allowance-shared-block',
      input.allowance.sharedBlock !== null && input.allowance.blockHash !== null,
      'Allowance evidence is pinned to a shared block and hash.',
      'Allowance evidence lacks a shared block or hash.',
    ),
    paperCheck(
      'allowance-provider-count',
      input.allowance.providerCount >= 2,
      'At least two read providers supplied evidence.',
      'Fewer than two read providers supplied evidence.',
    ),
    paperCheck(
      'allowance-provider-agreement',
      input.allowance.providerAgreement,
      'Read providers agree on allowance evidence.',
      'Read providers disagree on allowance evidence.',
    ),
    paperCheck(
      'allowance-maximum-age',
      Number.isInteger(input.allowance.maximumAgeSeconds) && input.allowance.maximumAgeSeconds > 0,
      'Allowance freshness threshold is valid.',
      'Allowance freshness threshold is invalid.',
    ),
    paperCheck(
      'allowance-freshness',
      freshness === 'fresh',
      'Allowance evidence is fresh.',
      `Allowance evidence freshness is ${freshness}.`,
    ),
  ]

  const failedChecks = checks.filter((item) => item.status === 'fail')
  const decision: WethAllowancePaperDecision =
    failedChecks.length > 0
      ? 'blocked'
      : input.allowance.allowance === 0n
        ? 'noop'
        : 'ready-for-separate-simulation-review'
  const reasons =
    failedChecks.length > 0
      ? failedChecks.map((item) => item.message)
      : decision === 'noop'
        ? ['Current allowance is already zero; no transaction should be requested.']
        : [
            'Current allowance is nonzero and all paper checks pass. A separate reviewed simulation-design issue is required before transaction construction.',
          ]

  const reportWithoutDigest = {
    mode: 'read-only-paper' as const,
    generatedAt,
    operation: WETH_ALLOWANCE_REVOCATION_OPERATION,
    intent: normalizedIntent,
    evidence: {
      registry: input.registry,
      authority: input.authority,
      allowance: {
        ...input.allowance,
        freshness,
        ageSeconds,
      },
    },
    checks,
    decision,
    reasons,
    executionEligible: false as const,
    disclaimer:
      'This paper-mode report does not encode transaction calldata, simulate or construct a state-changing call, connect a wallet, request a signature, submit a transaction, move funds, or recommend capital deployment.',
  }

  return {
    ...reportWithoutDigest,
    evidenceDigest: keccak256(stringToHex(canonicalJson(reportWithoutDigest))),
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function normalizeAddress(value: string): Address | null {
  if (!isAddress(value, { strict: true })) return null
  try {
    return getAddress(value)
  } catch {
    return null
  }
}

function allowanceFreshness(evidence: WethAllowanceReadEvidence, generatedAt: Date): WethAllowanceFreshness {
  if (evidence.status !== 'available' || evidence.observedAt === null || Number.isNaN(evidence.observedAt.getTime())) {
    return 'unavailable'
  }
  if (!Number.isInteger(evidence.maximumAgeSeconds) || evidence.maximumAgeSeconds <= 0) return 'unavailable'
  const ageMilliseconds = generatedAt.getTime() - evidence.observedAt.getTime()
  if (ageMilliseconds < 0) return 'future'
  return Math.floor(ageMilliseconds / 1_000) <= evidence.maximumAgeSeconds ? 'fresh' : 'stale'
}

function allowanceAgeSeconds(evidence: WethAllowanceReadEvidence, generatedAt: Date): number | null {
  if (evidence.observedAt === null || Number.isNaN(evidence.observedAt.getTime())) return null
  return Math.floor((generatedAt.getTime() - evidence.observedAt.getTime()) / 1_000)
}

function paperCheck(code: string, passes: boolean, passMessage: string, failMessage: string): WethAllowancePaperCheck {
  return {
    code,
    status: passes ? 'pass' : 'fail',
    message: passes ? passMessage : failMessage,
  }
}

function canonicalize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => canonicalize(item))
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)] as const)
    return Object.fromEntries(entries)
  }
  return value
}
