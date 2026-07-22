import { keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem'
import { canonicalJson, WETH_ALLOWANCE_REVOCATION_OPERATION } from './weth-allowance-paper.js'
import {
  evaluateWethAllowanceSimulationReviewLifecycle,
  type WethAllowanceSimulationReviewCurrentState,
  type WethAllowanceSimulationReviewLifecycleResult,
} from './weth-allowance-simulation-review-lifecycle.js'
import type { WethAllowanceSimulationReviewReport } from './weth-allowance-simulation-review-report.js'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

export const WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION = '1.0.0' as const
export const WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_LIFETIME_SECONDS = 300 as const

export type WethAllowanceRevocationReviewIntentBody = Readonly<{
  schemaVersion: typeof WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION
  operation: typeof WETH_ALLOWANCE_REVOCATION_OPERATION
  generatedAt: string
  expiresAt: string
  buildCommit: string
  chainId: typeof ROBINHOOD_CHAIN_ID
  owner: Address
  destination: Address
  reviewedImplementation: Address
  functionName: 'approve'
  token: Address
  spender: Address
  desiredAllowance: '0'
  nativeValue: '0'
  paperEvidenceDigest: Hex
  reviewReportDigest: Hex
  policyEvidenceDigest: Hex
  lifecycleDigest: Hex
  currentStateDigest: Hex
  sharedBlock: string
  blockHash: Hex
}>

export type WethAllowanceRevocationReviewIntent = WethAllowanceRevocationReviewIntentBody &
  Readonly<{
    intentId: Hex
  }>

export type WethAllowanceRevocationReviewIntentCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethAllowanceRevocationReviewIntentLifecycleReference = Readonly<{
  status: WethAllowanceSimulationReviewLifecycleResult['status']
  originalReportDigest: Hex
  currentStateDigest: Hex
  lifecycleDigest: Hex
  reasonCodes: readonly string[]
}>

export type WethAllowanceRevocationReviewIntentResult = Readonly<{
  schemaVersion: typeof WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION
  status: 'blocked' | 'ready-for-human-review'
  assessedAt: string | null
  intent: WethAllowanceRevocationReviewIntent | null
  intentId: Hex | null
  lifecycle: WethAllowanceRevocationReviewIntentLifecycleReference
  checks: readonly WethAllowanceRevocationReviewIntentCheck[]
  reasonCodes: readonly string[]
  reasons: readonly string[]
  transactionBuildAuthorized: false
  implementationAuthorized: false
  simulationAuthorized: false
  signingEligible: false
  executionEligible: false
  disclaimer: string
}>

export type WethAllowanceRevocationReviewIntentInput = Readonly<{
  report: unknown
  currentState: unknown
  buildCommit: unknown
  generatedAt: unknown
  assessedAt: unknown
}>

export function createWethAllowanceRevocationReviewIntent(
  input: WethAllowanceRevocationReviewIntentInput,
): WethAllowanceRevocationReviewIntentResult {
  const lifecycle = evaluateWethAllowanceSimulationReviewLifecycle(input.report, input.currentState)
  const generatedAt = parseDate(input.generatedAt)
  const assessedAt = parseDate(input.assessedAt)
  const buildCommit = parseBuildCommit(input.buildCommit)

  const checks: WethAllowanceRevocationReviewIntentCheck[] = [
    intentCheck(
      'build-commit',
      buildCommit !== null,
      'Build commit is a full lowercase commit SHA.',
      'Build commit must be exactly 40 lowercase hexadecimal characters.',
    ),
    intentCheck(
      'generated-at',
      generatedAt !== null,
      'Generation timestamp is valid.',
      'Generation timestamp is invalid.',
    ),
    intentCheck(
      'assessed-at',
      assessedAt !== null,
      'Assessment timestamp is valid.',
      'Assessment timestamp is invalid.',
    ),
    intentCheck(
      'generated-not-future',
      generatedAt !== null && assessedAt !== null && generatedAt.getTime() <= assessedAt.getTime(),
      'Generation timestamp is not future-dated relative to assessment.',
      'Generation timestamp is future-dated or unavailable.',
    ),
    intentCheck(
      'review-window-open',
      generatedAt !== null &&
        assessedAt !== null &&
        assessedAt.getTime() < generatedAt.getTime() + WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_LIFETIME_SECONDS * 1_000,
      'Assessment occurs inside the fixed review lifetime.',
      'Assessment occurs after the fixed review lifetime or timestamps are unavailable.',
    ),
    intentCheck(
      'lifecycle-valid',
      lifecycle.status === 'valid-for-human-review',
      'Review lifecycle remains valid for human review.',
      'Review lifecycle is invalidated.',
    ),
    intentCheck(
      'lifecycle-authorization-disabled',
      lifecycle.implementationAuthorized === false &&
        lifecycle.simulationAuthorized === false &&
        lifecycle.executionEligible === false,
      'Lifecycle authorization remains disabled.',
      'Lifecycle authorization flags are not all disabled.',
    ),
  ]

  const report = lifecycle.status === 'valid-for-human-review' ? asValidatedReport(input.report) : null
  const currentState =
    lifecycle.status === 'valid-for-human-review' ? asValidatedCurrentState(input.currentState) : null
  const evidence = report?.evidence ?? null

  checks.push(
    intentCheck(
      'report-evidence',
      evidence !== null,
      'Validated operator-review evidence is present.',
      'Validated operator-review evidence is missing.',
    ),
    intentCheck(
      'policy-evidence-digest',
      report?.policyEvidenceDigest !== null && report?.policyEvidenceDigest !== undefined,
      'Policy evidence digest is present.',
      'Policy evidence digest is missing.',
    ),
    intentCheck(
      'owner-nonzero',
      evidence !== null && evidence.owner !== zeroAddress,
      'Owner is nonzero.',
      'Owner is zero or unavailable.',
    ),
    intentCheck(
      'operation-boundary',
      evidence !== null &&
        currentState !== null &&
        evidence.operation === WETH_ALLOWANCE_REVOCATION_OPERATION &&
        evidence.chainId === ROBINHOOD_CHAIN_ID &&
        evidence.token === ROBINHOOD_UNISWAP_V3.wrappedNative &&
        evidence.proxyAddress === ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address &&
        evidence.implementationAddress === ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address &&
        evidence.spender === ROBINHOOD_UNISWAP_V3.positionManager &&
        currentState.currentAllowance > 0n &&
        currentState.currentAllowance.toString() === evidence.allowanceBefore &&
        evidence.allowanceAfter === '0',
      'Evidence matches the exact pinned WETH allowance-revocation boundary.',
      'Evidence differs from the pinned WETH allowance-revocation boundary.',
    ),
  )

  for (const reasonCode of lifecycle.reasonCodes) {
    checks.push(
      intentCheck(
        `lifecycle-${reasonCode}`,
        false,
        'Lifecycle check passed.',
        `Lifecycle invalidation remains active: ${reasonCode}.`,
      ),
    )
  }

  let intent: WethAllowanceRevocationReviewIntent | null = null
  const failedChecks = checks.filter((check) => check.status === 'fail')
  if (
    failedChecks.length === 0 &&
    generatedAt !== null &&
    buildCommit !== null &&
    report !== null &&
    evidence !== null &&
    currentState !== null &&
    report.policyEvidenceDigest !== null
  ) {
    const body: WethAllowanceRevocationReviewIntentBody = {
      schemaVersion: WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION,
      operation: WETH_ALLOWANCE_REVOCATION_OPERATION,
      generatedAt: generatedAt.toISOString(),
      expiresAt: new Date(
        generatedAt.getTime() + WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_LIFETIME_SECONDS * 1_000,
      ).toISOString(),
      buildCommit,
      chainId: ROBINHOOD_CHAIN_ID,
      owner: evidence.owner,
      destination: ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address,
      reviewedImplementation: ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address,
      functionName: 'approve',
      token: ROBINHOOD_UNISWAP_V3.wrappedNative,
      spender: ROBINHOOD_UNISWAP_V3.positionManager,
      desiredAllowance: '0',
      nativeValue: '0',
      paperEvidenceDigest: evidence.paperEvidenceDigest,
      reviewReportDigest: report.reportDigest,
      policyEvidenceDigest: report.policyEvidenceDigest,
      lifecycleDigest: lifecycle.lifecycleDigest,
      currentStateDigest: lifecycle.currentStateDigest,
      sharedBlock: evidence.sharedBlock,
      blockHash: evidence.blockHash,
    }
    const intentId = digestWethAllowanceRevocationReviewIntentBody(body)
    intent = { ...body, intentId }
  }

  const status = intent === null ? ('blocked' as const) : ('ready-for-human-review' as const)
  const reasonCodes = checks.filter((check) => check.status === 'fail').map((check) => check.code)
  const reasons =
    status === 'ready-for-human-review'
      ? [
          'The immutable typed intent is ready for human review only. It does not authorize transaction construction, simulation-provider access, signing, or execution.',
        ]
      : checks.filter((check) => check.status === 'fail').map((check) => check.message)

  return {
    schemaVersion: WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION,
    status,
    assessedAt: assessedAt?.toISOString() ?? null,
    intent,
    intentId: intent?.intentId ?? null,
    lifecycle: {
      status: lifecycle.status,
      originalReportDigest: lifecycle.originalReportDigest,
      currentStateDigest: lifecycle.currentStateDigest,
      lifecycleDigest: lifecycle.lifecycleDigest,
      reasonCodes: [...lifecycle.reasonCodes],
    },
    checks,
    reasonCodes,
    reasons,
    transactionBuildAuthorized: false,
    implementationAuthorized: false,
    simulationAuthorized: false,
    signingEligible: false,
    executionEligible: false,
    disclaimer:
      'This offline typed intent is a human-review artifact only. It contains no selector, ABI data, calldata, transaction request, provider endpoint, credential, wallet state, signature, nonce, gas field, submission field, receipt, or execution authority.',
  }
}

export function digestWethAllowanceRevocationReviewIntentBody(body: WethAllowanceRevocationReviewIntentBody): Hex {
  return keccak256(stringToHex(canonicalJson(body)))
}

function asValidatedReport(value: unknown): WethAllowanceSimulationReviewReport | null {
  if (!isRecord(value)) return null
  return value as WethAllowanceSimulationReviewReport
}

function asValidatedCurrentState(value: unknown): WethAllowanceSimulationReviewCurrentState | null {
  if (!isRecord(value)) return null
  return value as WethAllowanceSimulationReviewCurrentState
}

function parseBuildCommit(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : null
}

function parseDate(value: unknown): Date | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null
  return new Date(value.getTime())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function intentCheck(
  code: string,
  passes: boolean,
  passMessage: string,
  failMessage: string,
): WethAllowanceRevocationReviewIntentCheck {
  return {
    code,
    status: passes ? 'pass' : 'fail',
    message: passes ? passMessage : failMessage,
  }
}
